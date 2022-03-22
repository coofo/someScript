## 配置说明

### sync

`boolean`
是否使用同步下载，选择异步可能速度更快，但可能受到网站限制

### downloadMode

`string`
下载模式，选项如下
> * single：将图片文件单个下载（如果需要保存的文件有文件夹结构，则需要将tampermonkey下载模式调整为【浏览器API】，操作方法可以参考https://www.tampermonkey.net/faq.php?ext=dhdg#Q302 ）
>* zip：将图片打成zip包下载

### downloadRetryTimes

`int`
下载失败重试次数

### fileNameTemplate

`string`
图片文件名模板

### zipNameTemplate

`string`
zip文件名模板

## 模板变量说明

|变量|说明|
|:---:|:---:|
|${userId}|用户ID|
|${userName}|用户名|
|${id}|插图ID|
|${page}|插图序号|
|${page2}|插图序号（2位）|
|${page3}|插图序号（3位）|
|${page4}|插图序号（4位）|

## 更新日志

### 0.1.1

* 新增同步下载模式并设置为默认模式

### 0.1.0

* 支持需要key的作品下载
* 完善失败重下机制

### 0.0.2

* 支持zip打包下载