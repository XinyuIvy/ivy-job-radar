# BOSS 本地一键采集器

这个采集器把 BOSS 登录状态和 Cookie 留在你的 Mac 上。主流程由你主动启动，不要求 Mac 在固定时间开机。每次双击桌面启动器后，它会从上次进度继续搜索一批关键词和城市，读取完整 JD，执行筛选与去重，并把合格岗位实时同步到 Ivy Job Radar。

## 首次安装

先确保仓库已经更新，并且 `~/.ivy-job-radar/collector.env` 已配置。然后运行：

```bash
python3 local-collector/boss_radar.py setup
python3 local-collector/boss_one_click.py install
```

第一条命令会安装采集依赖并打开独立的 BOSS Chrome profile。请只在这个窗口登录 BOSS。第二条命令会在桌面创建 **一键扫描BOSS.command**。

以后使用时：

1. 确认 BOSS 专用 Chrome 仍处于登录状态。
2. 双击桌面的 **一键扫描BOSS.command**。
3. 等终端显示本轮汇总。合格岗位此时已经进入 Ivy Job Radar。

如果专用浏览器没有打开或登录失效，可以运行：

```bash
python3 local-collector/boss_one_click.py open-browser
```

## 扫描范围与断点续扫

搜索计划包含 8 个城市和 8 个关键词，共 64 个组合。默认每次处理 8 个组合，每个组合读取 1 页，因此通常运行 8 次会完成一轮。进度保存在 `~/.ivy-job-radar/boss-state.json`，关闭电脑或中途暂停不会丢失已经完成的组合。

每轮结束会显示：

- 计划与已完成搜索数；
- 本轮发现岗位数；
- 合格岗位数；
- 排除或字段不完整数；
- 网站新增数；
- 已更新或重复数；
- 当前轮剩余组合数；
- 是否需要处理登录或验证码。

最近一次详细汇总保存在 `~/.ivy-job-radar/reports/boss-latest.json`。也可随时查看状态：

```bash
python3 local-collector/boss_one_click.py status
```

## 安全边界

采集器不会绕过验证码，不会自动打招呼、发消息或投递，也不会上传 Cookie、招聘者姓名、在线状态、头像、联系方式、聊天或简历。出现登录过期、验证码、访问频繁或页面结构变化时，本轮会暂停并提示你查看 BOSS 专用窗口。

原有“保存当前 JD”书签继续保留，用于补录自动扫描遗漏的单个岗位。固定时间的 `launchd` 采集不再是推荐流程。

底层采集由独立维护的 [eatmoreduck/boss-zhipin-scraper](https://github.com/eatmoreduck/boss-zhipin-scraper) 提供。它不是 BOSS 官方 API，其可用性会随平台变化。
