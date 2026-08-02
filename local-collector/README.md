# BOSS 本地采集器

这个采集器把 BOSS 登录状态和 Cookie 留在你的 Mac 上。它每次只运行一小批轮换搜索，删除招聘者身份、活跃状态和联系方式，只把符合目标岗位的公司、职位、地点、完整 JD、技能和职位链接发送到 Ivy Job Radar。

## 首次安装（macOS）

1. 打开 Ivy Job Radar 的 **采集** 页面，下载 `collector.env`。
2. 第一次安装时，在 Terminal 中运行：

```bash
cd ~
git clone https://github.com/XinyuIvy/ivy-job-radar.git
cd ivy-job-radar
```

如果电脑上已经有这个仓库，则进入原目录并运行 `git pull`。然后继续：

```bash
mkdir -p ~/.ivy-job-radar
mv ~/Downloads/collector.env ~/.ivy-job-radar/collector.env
chmod 600 ~/.ivy-job-radar/collector.env
python3 local-collector/boss_radar.py setup
```

`setup` 会安装上游开源采集器并打开独立 Chrome。请在这个窗口中登录一次 BOSS；它与日常 Chrome profile 分开，不会复制 Gmail、GitHub、密码或浏览历史。登录成功后，脚本会自动做一次环境检查。

## 安装网站按钮的后台服务

```bash
python3 local-collector/boss_radar.py doctor
python3 local-collector/china_scan_agent.py install
```

安装后不再需要桌面启动器。Mac 登录时后台服务会自动启动，并等待 Ivy Job Radar 网站发来的扫描任务。原来的 `~/Desktop/一键扫描BOSS.command` 会在安装成功后删除。

以后使用方式：

1. 打开 Ivy Job Radar 的“今日岗位”或“采集”页面。
2. 点击 **开始中国岗位扫描**。
3. Mac 自动领取任务，依次扫描 BOSS 和已启用的中国公开来源。
4. 岗位与分来源汇总自动回写网站。

Mac 关机时，网站任务会保持排队；下次登录 Mac 后自动执行。BOSS 登录过期或出现验证码时，网页会显示需要处理，采集器不会绕过验证。

默认每批执行 8 个“关键词 × 城市”组合，每个组合只取 1 页。每次运行会从上一次成功位置继续轮换，不会一次性发送大量请求。

## 管理后台服务

查看服务日志：

```bash
tail -n 100 ~/.ivy-job-radar/logs/china-web-control.log
tail -n 100 ~/.ivy-job-radar/logs/china-web-control-error.log
```

关闭网站按钮的 Mac 后台服务：

```bash
python3 local-collector/china_scan_agent.py uninstall
```

重新启用：

```bash
python3 local-collector/china_scan_agent.py install
```

## 什么时候仍需你介入

以下情况采集器会停止，不会继续密集重试：

- BOSS 登录过期；
- 出现验证码、安全验证、访问频繁或环境异常；
- BOSS 修改页面或接口，导致上游采集器失效；
- Mac 关机或未登录（任务会保留到下次登录）。

采集器不会绕过验证码，不会自动打招呼、发消息或投递，也不会把招聘者姓名、职位、在线状态、头像或联系方式上传到网站。

## 调整搜索范围

编辑 `local-collector/search-plan.json` 可以修改城市和关键词。建议把 `pages` 保持为 1 或 2，并通过轮换批次扩大覆盖范围。

筛选器会保留与生物统计、生命科学、AI for Science、计算生物或新药研发相关的“创新算法研究员 / 算法研究员 / 算法科学家”等岗位，同时排除以大模型、NLP、推荐或广告算法为核心的岗位。

底层采集由独立维护的 [eatmoreduck/boss-zhipin-scraper](https://github.com/eatmoreduck/boss-zhipin-scraper) 提供。它不是 BOSS 官方 API，其可用性会随平台变化。
