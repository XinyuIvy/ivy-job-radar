# BOSS 本地采集器

这个采集器把 BOSS 登录状态和 Cookie 留在你的 Mac 上。它通过专用 Chrome 中正常渲染的搜索页和职位详情页读取岗位，不调用触发 `code 37` 的 BOSS 内部搜索接口。它每次只运行一小批轮换搜索，删除招聘者身份、活跃状态和联系方式，只把符合目标岗位的公司、职位、地点、完整 JD、技能和职位链接发送到 Ivy Job Radar。

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

`setup` 会安装启动依赖并打开独立 Chrome。请在这个窗口中登录一次 BOSS；它与日常 Chrome profile 分开，不会复制 Gmail、GitHub、密码或浏览历史。登录后先手动打开一次职位搜索页，再回到 Terminal 运行 `doctor`。

## 先做一次小规模测试

```bash
python3 local-collector/boss_radar.py doctor
python3 local-collector/boss_radar.py run --dry-run
```

`--dry-run` 会在专用 Chrome 中真实打开搜索页和职位详情页，并在 Terminal 显示经过清洗的结果，但不会上传。确认公司名、职位、城市和 JD 正常后，再运行一次正式同步：

```bash
python3 local-collector/boss_radar.py run
```

默认每批执行 4 个“关键词 × 城市”组合，每个组合只取 1 页。每次运行会从上一次成功位置继续轮换，不会一次性发送大量请求。每个组合使用独立文件，成功的搜索会全部合并，不会只保留最后一次搜索。

## 开启每日自动采集

```bash
python3 local-collector/boss_radar.py install-schedule
```

macOS 会在本地时间 08:30 和 20:30 各运行一次。安装时会把执行脚本和搜索计划复制到 `~/.ivy-job-radar/collector/`，因此之后移动或删除仓库不会破坏定时任务。

查看最近一轮状态：

```bash
python3 local-collector/boss_radar.py status
tail -n 100 ~/.ivy-job-radar/logs/boss-collector.log
tail -n 100 ~/.ivy-job-radar/logs/boss-collector-error.log
```

关闭定时任务：

```bash
python3 local-collector/boss_radar.py uninstall-schedule
```

## 什么时候仍需你介入

以下情况采集器会停止，不会继续密集重试：

- BOSS 登录过期；
- 出现验证码、安全验证、访问频繁或环境异常；
- BOSS 修改页面或接口，导致上游采集器失效；
- Mac 在两个计划时间均关机或休眠。

采集器不会绕过验证码，不会自动打招呼、发消息或投递，也不会把招聘者姓名、职位、在线状态、头像或联系方式上传到网站。

## 调整搜索范围

编辑 `local-collector/search-plan.json` 可以修改城市和关键词。建议把 `pages` 保持为 1 或 2，并通过轮换批次扩大覆盖范围。如果修改后希望定时任务采用新配置，请重新运行 `install-schedule`。

专用 Chrome 的启动与隔离 profile 由独立维护的 [eatmoreduck/boss-zhipin-scraper](https://github.com/eatmoreduck/boss-zhipin-scraper) 提供；岗位采集使用本仓库的渲染页面模式。它不是 BOSS 官方 API，其可用性会随平台页面变化。
