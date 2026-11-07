# Job Radar：统一后端 ETL

## 现在的流程

两条入口各自采集，不需要等待另一条完成。它们使用同一个 TypeScript 后端处理服务。

1. **Python / GitHub Actions**：请求数据源，解析 JSON、RSS、XML 或 HTML，将来源记录包装后保存，再通过 HTTP 上传。
2. **站内 / Cloudflare Workers**：请求 ATS 或网页，解析来源记录，直接调用公共后端服务。
3. **公共后端**：字段映射、文本清洗、类型与格式处理、资格校验、批准规则、规则评分、本批去重、数据库查重、新增或更新。

站内路径使用函数调用；Python 路径使用 HTTPS。它们最终都调用 `app/lib/job-ingestion.ts` 的 `ingestJobs`。

## E：采集和传输

主工作流：`.github/workflows/daily-us-jobscan.yml`。

当前采集入口是 `scripts/collect_raw_jobs.py`，覆盖 JobSpy 查询、公开来源、Aggregator 分片和公司池官网。它不调用旧的 Python 岗位评分、清洗、逻辑身份去重或筛选流程。来源查询条件和分页限制仍决定采集范围。

来源记录保留原字段，传输约定如下：

```json
{
  "provider": "jobspy",
  "raw": {
    "company": "Example",
    "title": "Data Scientist",
    "description": "Source description",
    "job_url": "https://example.com/jobs/12345"
  },
  "context": {
    "source": "JobSpy",
    "region": "美国",
    "status": "待官网核验",
    "collectedAt": "2026-11-07T10:00:00Z"
  }
}
```

这是格式示例，不是真实岗位。`raw` 是来源记录；`context` 是采集时知道的来源、公司、时间和入口信息。JSON 是传输格式；它不表示数据已经清洗。

网络响应解析、定位岗位对象、拼接请求地址和 JSON 序列化属于采集或传输。避免重复抓取同一个页面的 URL 集合只是控制网络请求，不是合并逻辑岗位。

输出：`data/scans/raw_jobs_latest.json`，内容是包装记录组成的数组；重复岗位和空值会保留。

采集回执：`data/scans/raw_collection_receipt_latest.json`，记录来源成功和失败。部分来源失败不能当作岗位关闭的证据。

这两份文件由 GitHub Actions 上传为 `raw-jobscan-<run_id>` 运行产物，保留30天，不提交到 Git。原因是未筛选的原始快照可能很大，不能依赖 Git 仓库保存每次完整响应。旧的 `all_jobs_latest.json` 是历史产物，不再作为主工作流的新采集输出。

`scripts/sync_raw_jobs.py` 读取快照，调用 `split_json_batches.py` 按最多100条、最多1000000字节拆批，再 POST `/api/jobs/import`。拆批改变传输批次，不改变岗位内容。

## T：后端统一转换

唯一的字段约定及来源别名：`config/job-ingestion.schema.json`。

公共服务：`app/lib/job-ingestion.ts`。

1. 从传输包装读取来源记录和上下文；兼容旧客户端的岗位对象数组。
2. 按 Schema 的字段别名寻找公司、岗位名、地点、JD、链接和编号。
3. 清理 HTML、空白，统一地点与时间表示，拒绝无效 URL、缺失必填项或不支持的地区。
4. 规范 URL，保留岗位身份参数，使用共用身份判断识别同一岗位。
5. 在后端应用现有资格规则、忽略记录、已批准的人工筛选规则，并重新计算规则分。不会信任上传者给的分数。
6. 合并同批重复岗位，优先保留完整 JD，避免空值覆盖，保留来源信息。

这是统一处理入口，并不代表资格规则已重新设计。没有新训练推荐模型，也没有改变 CV 自动生成的暂停状态。

## L：D1 写入

存储适配器：`app/lib/job-ingestion-store.ts`。表结构：`db/schema.ts`。

1. 查询已有的 URL、规范链接、岗位编号或公司与标题候选。
2. 用 `sameLogicalJob` 确认是否为同一个岗位。
3. 已有记录 UPDATE；新记录 INSERT。
4. 保留首次发现时间，避免空 JD、地点和技能覆盖已有有效内容。

同一个扫描上下文内的写入会串行执行。多个独立 HTTP 请求之间仍不是严格的全局原子 upsert，不宣称 exactly-once。HTTP 重试一般按已有身份更新记录。

后端响应包含 received、created、updated、skipped、duplicates、invalid 和拒绝原因统计。`duplicates` 表示本批合并数量，不等于整轮所有来源的唯一岗位数。跨批重复由数据库查重处理，会记为 updated。

Python 将响应统计保存为 `data/scans/backend_ingestion_receipt_latest.json`。这份回执也保存在 Actions 运行产物中。原始数据批次只进行局部处理，最后发送 finalize_run 收尾请求统一检查已过截止日期的记录；不会因某批没有看到一个岗位就将其关闭。

## 旧入口与重跑

- `/api/jobs/import-learned` 只是同一个认证导入处理函数的兼容入口，不再解析和修改一次数据再转发。
- 旧 Python 脚本保留给历史流程或其他本地功能使用，但主美国工作流不再执行旧的 JobSpy normalize、merge、score 等处理链。
- `sync-latest-job-snapshot.yml` 下载最近一次采集运行的原始产物，再经过同一个后端重放；不重新执行 Python 清洗。
- 站内浏览和状态修复仍有业务逻辑。这里统一的是两条自动采集路径的转换与入库，不是重写所有历史人工管理接口。

## 如何自己走读

先看工作流，再依次看 collect_raw_jobs.py、原始 JSON、sync_raw_jobs.py、导入路由、job-ingestion.ts、job-ingestion-store.ts、D1 jobs 行，最后看 GET `/api/jobs` 和 React 看板。

看原始与中间文件时，打开 GitHub Actions 的对应运行，再下载 `raw-jobscan-<run_id>`。旧记录可能只有旧流程产物，不能拿旧快照证明新流程已经实际运行过。
