// ==UserScript==
// @name         myrenta图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.1.9
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @match        https://tw.myrenta.com/item/*
// @include      /^https://reader.myrenta.com/viewer/sc/viewer_aws/[0-9a-z]+/[\d-]+/type_(6|10)/index.html(\?.*)?$/
// @include      /^https://reader.myrenta.com/viewer/sc/viewerjs/[0-9a-z]+/[\d-]+/RTL001/index.html(\?.*)?$/
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1107527
// @require      https://greasyfork.org/scripts/453330-coofoutils-tampermonkeyutils/code/coofoUtils-tampermonkeyUtils.js?version=1106599
// @require      https://greasyfork.org/scripts/453329-coofoutils-comicinfo/code/coofoUtils-comicInfo.js?version=1106598
// @connect      myrenta-books.*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==


(function (tools) {
    'use strict';    //setting
    let setting = tools.setting;
    let url = window.location.href;


    setting.def = {};
    setting.def.imageNameTemplate = "${index_index4}";
    /**
     * 文件名格式（包括路径）
     * ${itemId}       漫画ID
     * ${title}        漫画名
     * ${index}        插图序号
     */
    setting.def.cbzNameTemplate = "[myrenta]/${bookId_squareBracket}${author_squareBracket}${bookName_path}${itemId_squareBracket}${title}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.def.zipNameTemplate = "[myrenta]${itemId_squareBracket}${originalTitle}";


    //设置按钮
    GM_registerMenuCommand("文件名设置", function () {
        let html = `图片名格式<br/><input id="imageNameTemplate" style="width: 90%;"><br/>
                    cbz包名格式<br/><input id="cbzNameTemplate" style="width: 90%;"><br/>
                    压缩包名格式<br/><input id="zipNameTemplate" style="width: 90%;"><br/>
                        <!--<button id="saveTemplate">保存</button><button id="resetTemplate">默认值</button>-->`;
        Swal.fire({
            title: '命名模板设置',
            html: html,
            footer: `<div><table border="1">
                             <tr><td>巨集</td><td>说明</td></tr>
                             <tr><td>\${bookId}</td><td>作品集合ID（暂存信息后才可获取）</td></tr>
                             <tr><td>\${bookName}</td><td>作品名称（暂存信息后才可获取）</td></tr>
                             <tr><td>\${author}</td><td>作者（暂存信息后才可获取）</td></tr>
                             <tr><td>\${itemId}</td><td>册ID</td></tr>
                             <tr><td>\${originalTitle}</td><td>完整册标题名</td></tr>
                             <tr><td>\${title}</td><td>册标题名</td></tr>
                             <tr><td>\${index}</td><td>图序号</td></tr>
                          </table><br>
                          <table border="1">
                             <tr><td>后缀</td><td>说明（取到值时才生效，取不到则替换为空字符串）</td></tr>
                             <tr><td>empty</td><td>未取到时填充为空字符串</td></tr>
                             <tr><td>parenthesis</td><td>圆括号</td></tr>
                             <tr><td>squareBracket</td><td>方括号</td></tr>
                             <tr><td>curlyBracket</td><td>大括号</td></tr>
                             <tr><td>path</td><td>后加文件夹分隔符</td></tr>
                             <tr><td>index2</td><td>向前添0补全至2位</td></tr>
                             <tr><td>index3</td><td>向前添0补全至3位（以此类推）</td></tr>
                         </table></div>`,
            confirmButtonText: '保存',
            showDenyButton: true,
            denyButtonText: `恢复默认`,
            showCancelButton: true,
            cancelButtonText: '取消'
        }).then((result) => {
            if (result.isConfirmed) {
                let templateSetting = {
                    imageNameTemplate: $('#imageNameTemplate').val(),
                    cbzNameTemplate: $('#cbzNameTemplate').val(),
                    zipNameTemplate: $('#zipNameTemplate').val()
                };
                GM_setValue("templateSetting", templateSetting);
            } else if (result.isDenied) {
                GM_deleteValue("templateSetting");
            }
        });
        let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));

        $('#imageNameTemplate').val(templateSetting.imageNameTemplate);
        $('#cbzNameTemplate').val(templateSetting.cbzNameTemplate);
        $('#zipNameTemplate').val(templateSetting.zipNameTemplate);

    });


    let urlMatch = null;
    if ((urlMatch = url.match(tools.myrenta.regex.bookUrl)) != null) {
        //介绍页面
        //添加按钮
        $('#addMyList').next().after(`<a id="saveBookInfo" href="javascript:;" class="btn btn-collect" style="margin-bottom: 13px;">暂存信息</a>
                                      <a id="autoDownload" href="javascript:;" class="btn btn-collect" style="margin-bottom: 13px;">auto（test）</a>`);

        let saveBookInfo = async function () {
            let publisher = $('div.info-main>ul>li:contains(發行)>div.text>a>h2').toArray().map(o => $(o).html());
            publisher.push('myrenta');
            let summaries = [];

            let volBtns = $("div.vol-btns:first").find("div.vol-btn").toArray();
            let i = 0;
            do {
                let div = null;
                if (volBtns.length > 0) {
                    div = volBtns[i];
                    $(div).click();
                    await new Promise(resolve => setTimeout(() => resolve(), 0));
                }
                $(".other-vols").toArray().map(o => summaries.push({
                    title: $(o).find("h4").text().trim(),
                    summary: $(o).find(".intro-text p").text().trim()
                }));

                i++;
            } while (i < volBtns.length);

            let info = {
                bookId: urlMatch[1],
                bookName: $('div.main>div.breadcrumbs>a:last').html(),
                author: $('div.info-main>ul>li:contains(作者)>div.text>a>h2').html(),
                publisher: publisher,
                tag: $('.btn-tag').toArray().map(o => $(o).html()),
                summarys: summaries
            };
            GM_setValue("bookInfo", info);
            return info;
        };

        //暂存触发
        $('#saveBookInfo').click(async function () {
            // console.log(GM_getValue("bookInfo",{}));
            let info = await saveBookInfo();
            let htmlEscape = coofoUtils.commonUtils.xss.htmlEscape;
            let html = '';
            for (let n in info) {
                let infoItem = info[n];
                if (n === 'summarys') {
                    infoItem = infoItem.length;
                }
                html += n + '：' + htmlEscape(infoItem) + '<br>';
            }
            Swal.fire({
                title: '已暂存信息',
                html: html,
                confirmButtonText: '确定',
                showCancelButton: true,
                cancelButtonText: '清空暂存',
            }).then((result) => {
                if (result.dismiss === Swal.DismissReason.cancel) {
                    GM_deleteValue("bookInfo");
                }
            });
        });

        //全自动触发
        $('#autoDownload').click(async function () {

            Swal.fire({
                icon: 'warning',
                title: '自动下载中',
                html: `<div id="status"></div>`,
                footer: `请勿关闭该页面`,
                showConfirmButton: false
            });

            await saveBookInfo();

            let volBtns = $("div.vol-btns:first").find("div.vol-btn").toArray();
            let i = 0;
            do {
                let div = null;
                if (volBtns.length > 0) {
                    div = volBtns[i];
                    $(div).click();
                    console.log("打开分页" + (i + 1));
                    await new Promise(resolve => setTimeout(() => resolve(), 0));
                }

                let otherVols = $("div.other-vols").toArray();
                for (let j = 0; j < otherVols.length; j++) {
                    let otherVolsDiv = $(otherVols[j]);

                    let starReading = otherVolsDiv.find("a.start-reading");
                    if (starReading.length > 0) {
                        GM_setValue("autoDownload", "p");
                        console.log("打开第" + (j + 1));
                        starReading.click();
                        await new Promise(async (resolve, reject) => {
                            let status = "p";
                            do {
                                await new Promise(resolve => setTimeout(() => resolve(), 1000));
                                status = GM_getValue("autoDownload", "n");
                                if(status === 'e'){
                                    Swal.fire({
                                        title: "auto error",
                                        icon: "error"
                                    });
                                    throw status;
                                }
                            } while (status !== "f");
                            resolve();
                        });
                        GM_deleteValue("autoDownload");
                    }
                }
                i++;
            } while (i < volBtns.length);

            Swal.fire({
                title: "auto finished",
                icon: "success"
            });
        });


    } else if (url.match(tools.myrenta.regex.bookDetailUrl) != null || url.match(tools.myrenta.regex.bookDetailUrl2) != null) {
        //阅读页面

        /**
         * 下载线程数量
         * @type {number}
         */
        setting.threadNum = 5;

        /**
         * 下载失败重试次数
         * @type {number}
         */
        setting.downloadRetryTimes = 2;

        //setting end
        let downloadBase = async function (bookInfo) {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            let context = tools.runtime.downloadTask;
            context.items = [];
            context.zip = new JSZip();
            context.bookInfo = bookInfo;

            let originalTitle = $("p.title span").html();
            bookInfo.originalTitle = originalTitle;
            let title = originalTitle;
            if ("bookName" in bookInfo) {
                let index = 0;
                for (let i = 0; i < Math.min(title.length, bookInfo.bookName.length); i++) {
                    if (title.charAt(i) === bookInfo.bookName.charAt(i)) {
                        index++;
                    } else {
                        break;
                    }
                }
                title = title.substring(index).trim();
            }

            //ComicInfo.xml
            let summary = '';
            if (context.bookInfo.summarys !== null && context.bookInfo.summarys !== undefined) {
                context.bookInfo.summarys.forEach(o => {
                    if (o.title.startsWith(originalTitle)) {
                        summary = o.summary;
                    }
                });
            }

            let xml = coofoUtils.comicInfoUtils.create({
                Series: context.bookInfo.bookName,
                Title: context.bookInfo.title,
                Summary: summary,
                Writer: context.bookInfo.author,
                Publisher: context.bookInfo.publisher.join(','),
                Tags: context.bookInfo.tag.join(','),
                LanguageISO: 'zh'
            });

            let item = {
                parent: context,
                itemInfo: {
                    originalTitle: originalTitle,
                    title: title,
                    itemId: urlMatch[3]
                },
                comicInfo: xml,
                images: [],
                cbz: new JSZip()
            };
            context.items.push(item);
            return context;
        };

        let downloadDif;
        let btn;
        if ((urlMatch = url.match(tools.myrenta.regex.bookDetailUrl)) != null) {
            //添加按钮
            if (urlMatch[4] === "6") {
                $("div.btnBox").after('<div class="btnBox"><a href="javascript:;" id="user_js_download" style="width: auto;padding: 0 10px 0 10px;background-size: 100% 100%;">⬇下载</a></div>');
            } else {
                $("a.chapter-prev").after(`<a id="user_js_download" class="chapter-btn" href="javascript:;">⬇下载</a>`);
            }

            btn = $("#user_js_download");
            tools.runtime.downloadTask.showMsg = function (msg) {
                btn.html(msg);
            };

            downloadDif = async (bookInfo) => await downloadBase(bookInfo).then(async context => {
                let item = context.items[0];
                let bookInfo = await new Promise(resolve => tools.myrenta.api.getBookInfo(urlMatch[1], urlMatch[2], bookInfo => resolve(bookInfo)));
                item.itemInfo.prdId = bookInfo.prd_id;
                for (let i = 0; i < bookInfo.dimension.length; i++) {
                    let image = {
                        parent: item,
                        imageInfo: {
                            ext: bookInfo.ext,
                            key: bookInfo.key,
                            page: i + 1,
                            index: i + 1,
                            suffix: "." + bookInfo.ext
                        },
                        imageFile: null
                    };
                    item.images.push(image);
                }

                //获取下载地址
                let generateTask = coofoUtils.service.task.create();
                tools.runtime.downloadTask.generateTask = generateTask;
                context.items.forEach(item => {
                    item.images.forEach(image => {
                        tools.runtime.downloadTask.generateTaskNum++;
                        generateTask.api.addTask(taskItem => tools.myrenta.downloadHelp.generateTask(taskItem, image), setting.downloadRetryTimes);
                    })
                });
                let generateTaskReturn = await generateTask.api.exec(setting.threadNum);

                if (generateTaskReturn.retryTimesOutNum > 0) {
                    Swal.fire({
                        icon: 'error',
                        title: '下载出错',
                        text: '解析地址 ' + generateTaskReturn.completeNum + ' - ' + generateTaskReturn.retryTimesOutNum
                    });
                    throw "下载出错";
                }

                //执行下载操作
                let downloadTask = coofoUtils.service.task.create();
                tools.runtime.downloadTask.downloadTask = downloadTask;

                context.items.forEach(item => {
                    item.images.forEach(image => {
                        tools.runtime.downloadTask.downloadTaskNum++;
                        downloadTask.api.addTask(taskItem => tools.myrenta.downloadHelp.downloadTask(taskItem, image), setting.downloadRetryTimes);
                    })
                });
                let downloadTaskReturn = await downloadTask.api.exec(setting.threadNum);

                if (downloadTaskReturn.retryTimesOutNum > 0) {
                    Swal.fire({
                        icon: 'error',
                        title: '下载出错',
                        text: '下载 ' + downloadTaskReturn.completeNum + ' - ' + downloadTaskReturn.retryTimesOutNum
                    });
                    throw "下载出错";
                }
                return context;
            });
        } else if ((urlMatch = url.match(tools.myrenta.regex.bookDetailUrl2)) != null) {
            //添加按钮
            $("div.btnBox").after('<div class="btnBox"><a href="javascript:;" id="user_js_download" style="width: auto;padding: 0 10px 0 10px;background-size: 100% 100%;">⬇下载</a></div>');

            btn = $("#user_js_download");
            tools.runtime.downloadTask.showMsg = function (msg) {
                btn.html(msg);
            };


            downloadDif = async (bookInfo) => await downloadBase(bookInfo).then(async context => {
                let item = context.items[0];
                let bookInfo = await new Promise(resolve => tools.myrenta.api.getBookInfo(urlMatch[1], urlMatch[2], bookInfo => resolve(bookInfo)));
                item.itemInfo.prdId = bookInfo.prd_id;
                for (let i = 0; i < bookInfo.dimension.length; i++) {
                    let image = {
                        parent: item,
                        imageInfo: {
                            ext: bookInfo.ext,
                            key: bookInfo.key,
                            page: i + 1,
                            index: i + 1,
                            suffix: "." + bookInfo.ext
                        },
                        imageFile: null
                    };
                    item.images.push(image);
                }

                //执行下载操作
                let downloadTask = coofoUtils.service.task.create();
                tools.runtime.downloadTask.downloadTask = downloadTask;

                context.items.forEach(item => {
                    item.images.forEach(image => {
                        tools.runtime.downloadTask.downloadTaskNum++;
                        downloadTask.api.addTask(taskItem => tools.myrenta.downloadHelp.downloadTask2(taskItem, image), setting.downloadRetryTimes);
                    })
                });
                let downloadTaskReturn = await downloadTask.api.exec(setting.threadNum);

                if (downloadTaskReturn.retryTimesOutNum > 0) {
                    Swal.fire({
                        icon: 'error',
                        title: '下载出错',
                        text: '下载 ' + downloadTaskReturn.completeNum + ' - ' + downloadTaskReturn.retryTimesOutNum
                    });
                    throw "下载出错";
                }


                return context;
            });
        } else {
            throw "url not match";
        }

        let download = (bookInfo) => downloadDif(bookInfo).then(async context => {
            //创建cbz
            let cbzCompleteNum = 0;

            let cbzGenerateTasks = context.items
                .map(item => new Promise(resolve => tools.myrenta.downloadHelp.generateCbz(item, () => {
                    cbzCompleteNum++;
                    tools.runtime.downloadTask.refreshStatus("打包", cbzCompleteNum, cbzGenerateTasks.length);
                    resolve();
                })));

            await Promise.all(cbzGenerateTasks);

            //创建zip
            let zipFile = await new Promise(resolve => tools.myrenta.downloadHelp.generateZip(context, zipFile => resolve(zipFile)));

            //触发下载
            let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, context.bookInfo) + ".zip";
            coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(zipFile, zipFileName);
            tools.runtime.downloadTask.showFinished(tools.runtime.downloadTask.downloadTaskNum, 0);
        });

        //++++++++++++++++++++++++++++++++++++++++++++++++++


        btn.click(function () {

            let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));
            setting.imageNameTemplate = templateSetting.imageNameTemplate;
            setting.cbzNameTemplate = templateSetting.cbzNameTemplate;
            setting.zipNameTemplate = templateSetting.zipNameTemplate;

            let info = GM_getValue("bookInfo", {});
            let html = '';
            let infoNum = 0;
            let htmlEscape = coofoUtils.commonUtils.xss.htmlEscape;
            for (let n in info) {
                if (!info.hasOwnProperty(n)) continue;
                let infoItem = info[n];
                if (n === 'summarys') {
                    infoItem = infoItem.length;
                }
                html += n + '：' + htmlEscape(infoItem) + '<br>';
                infoNum++;
            }
            if (infoNum > 0) {
                let icon;
                if ($("p.title span").html().startsWith(info.bookName)) {
                    icon = 'success';
                } else {
                    icon = 'warning';
                }
                Swal.fire({
                    icon: icon,
                    title: '将使用暂存信息',
                    html: html,
                    confirmButtonText: '使用',
                    showDenyButton: true,
                    denyButtonText: `不使用`,
                    showCancelButton: true,
                    cancelButtonText: '取消',
                }).then((result) => {
                    if (result.isConfirmed) {
                        download(info);
                    } else if (result.isDenied) {
                        download({});
                    }
                });

            } else {
                download({});
            }
        });


        let title = $("p.title span").html();
        console.log("autoDownload:" + GM_getValue("autoDownload", "n"));
        if (GM_getValue("autoDownload", "n") === 'p') {

            Swal.fire({
                icon: 'warning',
                title: '自动下载中',
                html: `<div id="status"></div>`,
                footer: `请勿关闭该页面`,
                showConfirmButton: false
            });

            let status = $("#status");
            tools.runtime.downloadTask.showMsg = function (msg) {
                status.html(msg);
            };

            let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));
            setting.imageNameTemplate = templateSetting.imageNameTemplate;
            setting.cbzNameTemplate = templateSetting.cbzNameTemplate;
            setting.zipNameTemplate = templateSetting.zipNameTemplate;

            let info = GM_getValue("bookInfo", {});

            let finished = function () {
                Swal.fire("自动下载成功", "该页面将自动关闭", "success");
                GM_setValue("autoDownload", "f");
                // window.close();
            };

            if (!title.startsWith(info.bookName)) {
                info = {};
            }
            download(info).then(() => finished(), () => {
                Swal.fire("自动下载失败", null, "error");
                GM_setValue("autoDownload", "e");
            });

        }
    }

})((function () {
    const constants = {};
    const cache = {};
    const tools = {
        setting: {pass: ""},
        runtime: {
            nowDownloading: false,
            downloadTask: {
                zip: null,
                generateTaskNum: 0,
                generatedTaskNum: 0,
                downloadTaskNum: 0,
                downloadedTaskNum: 0,
                showMsg: function (msg) {
                    console.log(msg);
                },
                refreshGenerateStatus: function () {
                    let completeNum = tools.runtime.downloadTask.generatedTaskNum;
                    let totalNum = tools.runtime.downloadTask.generateTaskNum;
                    tools.runtime.downloadTask.refreshStatus("解析地址", completeNum, totalNum);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.downloadedTaskNum;
                    let totalNum = tools.runtime.downloadTask.downloadTaskNum;
                    tools.runtime.downloadTask.refreshStatus("下载", completeNum, totalNum);
                },
                refreshStatus: function (name, completeNum, totalNum) {
                    let digitNum;
                    if (totalNum > 1000) {
                        digitNum = 2;
                    } else if (totalNum > 100) {
                        digitNum = 1;
                    } else {
                        digitNum = 0;
                    }
                    let percent = coofoUtils.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, digitNum) + "%";
                    tools.runtime.downloadTask.showMsg(name + " " + percent);
                },
                showFinished: function (completeNum, retryTimesOutNum) {
                    let msg = "下载完成：" + completeNum;
                    if (retryTimesOutNum > 0) {
                        msg = msg + " - " + retryTimesOutNum;
                    }
                    this.showMsg(msg);
                }
            }
        },
        myrenta: {
            regex: {
                bookDetailUrl: new RegExp("^https://reader.myrenta.com/viewer/sc/viewer_aws/([0-9a-z]+)/([0-9]+-([0-9]+)-[0-9]+)/type_(6|10)/index.html(\\?.*)?$"),
                bookDetailUrl2: new RegExp("^https://reader.myrenta.com/viewer/sc/viewerjs/([0-9a-z]+)/([0-9]+-([0-9]+)-[0-9]+)/RTL001/index.html(\\?.*)?$"),
                bookUrl: new RegExp("^https://tw\\.myrenta\\.com/item/(\\d+)")
            },
            utils: {
                imgDecode: function (imgSource, key) {
                    let mv = 0;
                    let hash_int = 0;
                    for (let i = 0; i < key.length; i++) {
                        if (i < 12)
                            mv += key.charAt(i);
                        else
                            hash_int += parseInt(key.charAt(i), 16);
                    }
                    let bytes = new Uint8Array(imgSource);
                    for (let i = 0; i < 2048 + hash_int; i++) {
                        bytes[i] *= -1;
                    }
                    return bytes;
                    // let binary = '';
                    // let len = bytes.byteLength;
                    // for (let i = 0; i < len; i++) {
                    //     binary += String.fromCharCode(bytes[i]);
                    // }
                    // return window.Uint8Array(binary);
                }
            },
            api: {
                getBookInfo: function (key, prdId, onSuccess, onError, onComplete) {
                    let data = {
                        ext: "dat",
                        prd_id: prdId,
                        key: key
                    };
                    $.ajax({
                        url: ".",
                        type: 'post',
                        data: data,
                        dataType: "json",
                        contentType: "application/x-www-form-urlencoded; charset=UTF-8",
                        success: function (request) {
                            // console.log(request);
                            onSuccess(request);
                        },
                        error: onError,
                        complete: onComplete
                    });
                },
                getImgUrl: function (ext, prd_id, page, type, onSuccess, onError, onComplete) {
                    let formData = new FormData();
                    formData.append('ext', ext);
                    formData.append('prd_id', prd_id);
                    formData.append('page', page);
                    formData.append('type', type);
                    formData.append('psss', 'sss');
                    $.ajax({
                        url: ".",
                        type: 'post',
                        data: formData,
                        processData: false,
                        contentType: false,
                        success: function (request) {
                            // console.log(request);
                            onSuccess(request);
                        },
                        error: onError,
                        complete: onComplete
                    });
                }
            },
            downloadHelp: {
                generateTask: function (taskItem, image) {
                    // console.log(image);
                    tools.myrenta.api.getImgUrl(image.imageInfo.ext, image.parent.itemInfo.prdId, image.imageInfo.page, 6, function (request) {
                        let imgUrlJson = CryptoJS.AES.decrypt(request, image.imageInfo.key, {format: CryptoJSAesJson}).toString(CryptoJS.enc.Utf8);
                        image.imgUrl = JSON.parse(imgUrlJson);

                        taskItem.success();
                        tools.runtime.downloadTask.generatedTaskNum++;
                        tools.runtime.downloadTask.refreshGenerateStatus();
                    }, function () {
                        taskItem.failed();
                    });
                },
                downloadTask: function (taskItem, image) {
                    //get
                    let request = new XMLHttpRequest();
                    request.open("GET", image.imgUrl);
                    request.responseType = 'blob';
                    request.onload = function () {
                        if (this.status === 200) {
                            let myReader = new FileReader();
                            myReader.readAsArrayBuffer(request.response);
                            myReader.addEventListener("load", function (e) {
                                let buffer = myReader.result;
                                if (buffer == null) {
                                    console.log('ERROR!!! 讀取 arraybuffer 錯誤!!');
                                    taskItem.failed();
                                } else {
                                    let arrayBufferView = new Uint8Array(buffer);
                                    // var blob = new Blob( [ arrayBufferView ] );

                                    // let arrayBuffer = tools.myrenta.utils.imgDecode(arrayBufferView, taskInfo.key);
                                    image.imageFile = arrayBufferView;

                                    taskItem.success();
                                    tools.runtime.downloadTask.downloadedTaskNum++;
                                    tools.runtime.downloadTask.refreshDownLoadStatus();
                                }
                            });
                        } else {
                            console.log(this.status);
                            taskItem.failed();
                        }
                    };
                    request.onerror = function (e) {
                        console.log(e);
                        taskItem.failed();
                    };
                    request.send();

                },
                downloadTask2: function (taskItem, image) {
                    //post
                    let request = new XMLHttpRequest();
                    request.open("POST", ".", true);
                    request.responseType = 'arraybuffer';
                    let formData = new FormData();
                    formData.append('ext', image.imageInfo.ext);
                    formData.append('prd_id', image.parent.itemInfo.prdId);
                    formData.append('page', image.imageInfo.page);
                    formData.append('type', "6");
                    request.onload = function () {
                        image.imageFile = tools.myrenta.utils.imgDecode(request.response, image.imageInfo.key);
                        taskItem.success();
                        tools.runtime.downloadTask.downloadedTaskNum++;
                        tools.runtime.downloadTask.refreshDownLoadStatus();
                    };
                    request.send(formData);

                },
                generateCbz: function (item, onFinished) {
                    if (item.images.length <= 0) {
                        //当不存在图片时
                        item.cbz = null;
                        onFinished();
                    } else {
                        item.images.forEach(image => {
                            let info = Object.assign({}, image.parent.parent.bookInfo, image.parent.itemInfo, image.imageInfo);
                            let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.imageNameTemplate, info) + image.imageInfo.suffix;
                            item.cbz.file(name, image.imageFile);
                            //释放
                            image.imageFile = null;
                        });
                        item.cbz.file("ComicInfo.xml", item.comicInfo);
                        item.cbz.generateAsync({type: "blob", compression: "STORE"})
                            .then(context => {
                                item.cbzFile = context;
                                //释放
                                item.cbz = null;
                                onFinished();
                            });
                    }
                },
                generateZip: function (context, onFinished) {
                    if (context.items.length <= 0) {
                        //当不存在子项时
                        context.zip = null;
                        onFinished();
                    } else {
                        context.items.forEach(item => {
                            let info = Object.assign({}, item.parent.bookInfo, item.itemInfo);
                            let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.cbzNameTemplate, info) + ".cbz";
                            context.zip.file(name, item.cbzFile);
                            //释放
                            item.cbzFile = null;
                        });
                        context.zip.generateAsync({type: "blob", compression: "STORE"})
                            .then(onFinished);
                        //释放
                        context.zip = null;
                    }
                },
                fileNameService: {
                    getFileName: function (downloadTaskInfo) {
                        let setting = tools.setting;
                        return coofoUtils.commonUtils.format.string.filePathByMap(setting.fileNameTemplate, downloadTaskInfo) + downloadTaskInfo.suffix;
                    }
                }
            }
        }
    };
    return tools;
})());