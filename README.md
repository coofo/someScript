# someScript

个人自用脚本集合，包括：

- **Tampermonkey 用户脚本**：各类图片站点的批量下载、广告清理、`ComicInfo.xml` 生成等
- **Windows 批处理**：文件夹 / zip 批量转 `cbz`
- **HTML 页面**：本地图片阅读器
- **提示词**：借助 AI 从图片生成 `ComicInfo.xml`

## 目录结构

```
someScript
├── bat/             Windows 批处理脚本
├── html/            纯前端 HTML 小工具
├── systemPrompt/    AI 提示词
├── tampermonkey/    Tampermonkey 用户脚本
└── README.md
```

## Tampermonkey 用户脚本

### 站点下载脚本

| 脚本 | 适用站点 | 功能 |
| --- | --- | --- |
| [afdian.user.js](tampermonkey/afdian.user.js) | `afdian.com/album/*` | 爱发电相册图片批量下载并打包为 zip |
| [bilibili.user.js](tampermonkey/bilibili.user.js) | `space.bilibili.com/*` | 用户带图动态批量下载（图片 + 动态文案 txt 打包） |
| [ehentai.user.js](tampermonkey/ehentai.user.js) | `e-hentai.org` / `exhentai.org` | 读取画廊标题、标签、语言等信息生成 `ComicInfo.xml` |
| [myreadingmanga.user.js](tampermonkey/myreadingmanga.user.js) | `myreadingmanga.info` | 多章节翻页抓取，支持单文件下载或 zip 打包 |
| [myrenta.user.js](tampermonkey/myrenta.user.js) | `tw.myrenta.com` / `reader.myrenta.com` | 下载阅读器图片；支持暂存书籍信息、按册打包 cbz、选择下载图片格式（avif/webp/jpeg）、自动下载流程 |
| [poipiku.user.js](tampermonkey/poipiku.user.js) | `poipiku.com` | 用户页 / 详情页图片下载，支持需要 key 才能查看的作品 |
| [x.user.js](tampermonkey/x.user.js) | `x.com/*/media` | 媒体页自动滚动并依次触发下载，同时可生成 `ComicInfo.xml` |
| [yandanshe.user.js](tampermonkey/yandanshe.user.js) | `yandanshe.com` | 多页章节图片抓取并打包 zip |
| [cocomanga.user.js](tampermonkey/cocomanga.user.js) | `cocomanga.com` | 移除页面广告浮层 |

### 公共函数库（被上面的脚本通过 `@require` 引用）

| 脚本 | 说明 |
| --- | --- |
| [coofoUtils.user.js](tampermonkey/coofoUtils.user.js) | 通用工具：数字/文件/字符串格式化、`assert`、下载辅助、任务与线程池、`retryablePromise` 等 |
| [coofoUtils-tampermonkeyUtils.user.js](tampermonkey/coofoUtils-tampermonkeyUtils.user.js) | `GM_download` / `GM_xmlhttpRequest` 的封装 |
| [coofoUtils-comicInfo.user.js](tampermonkey/coofoUtils-comicInfo.user.js) | 按 [ComicInfo 标准](https://anansi-project.github.io/docs/introduction) 生成 `ComicInfo.xml` |
| [coofoUtils-iyuuUtils.user.js](tampermonkey/coofoUtils-iyuuUtils.user.js) | 通过 iyuu 推送消息（需先配置 iyuuToken） |

## 安装与使用

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展。
2. 点击脚本链接打开 raw 地址后选择「安装」，例如：

   ```
   https://github.com/coofo/someScript/raw/main/tampermonkey/poipiku.user.js
   ```

3. 各下载脚本通过 `@require` 加载公共库，**升级公共库后无需重装业务脚本**。
4. 脚本功能一般通过两类入口触发：
   - 页面上注入的 `⬇下载` 按钮
   - Tampermonkey 菜单命令（如「文件名设置」「下载」）

### 命名模板

多数下载脚本支持自定义命名模板（菜单「文件名设置」）：

- 变量形如 `${bookName}`、`${index}`、`${chapterId}`，具体可用变量以各脚本设置弹窗中的表格为准。
- 变量可追加后缀控制输出形式：

  | 后缀 | 说明 |
  | --- | --- |
  | `empty` | 取不到值时替换为空字符串 |
  | `parenthesis` | 包裹圆括号 `()` |
  | `squareBracket` | 包裹方括号 `[]` |
  | `curlyBracket` | 包裹大括号 `{}` |
  | `path` | 末尾追加路径分隔符 `/` |
  | `index2` / `index3` … | 数字补零到指定位数 |

  示例：`[myrenta]/${author_squareBracket}${bookName_path}${index_index4}`

### 下载模式

- `zip`：图片打包成 zip 后一次下载（默认）。
- `single`：逐张下载；若模板中含文件夹结构，需将 Tampermonkey 的下载模式改为「浏览器 API」。

## Windows 批处理

| 脚本 | 用法 | 说明 |
| --- | --- | --- |
| [dir2cbz.bat](bat/dir2cbz.bat) | 拖拽一个或多个文件夹到脚本上 | 用 PowerShell 以「无压缩」方式打包为 zip，重命名为 `.cbz` 后放回原位置，并删除原文件夹 |
| [zip2cbz.bat](bat/zip2cbz.bat) | 拖拽一个或多个 `.zip` 到脚本上 | 仅做扩展名重命名，非 zip 文件会提示失败 |

## 提示词

| 文件 | 说明 |
| --- | --- |
| [systemPrompt/Img2ComicInfo.md](systemPrompt/Img2ComicInfo.md) | 让 AI 读取封面/版权页图片中的信息，输出符合规范的 `ComicInfo.xml` |

## 说明

- 脚本均为个人备份整理用途，请遵守目标网站的使用条款，控制请求频率。
- 站点改版可能导致脚本失效，欢迎提 [Issue](https://github.com/coofo/someScript/issues)。

