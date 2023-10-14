// ==UserScript==
// @name         manwa图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.3.1
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://(manwa|mwcomic\d*).(me|live|vip|fun|one|pro|city|space|cloud|co|online)/book/\d+/
// @include      /^https://(manwa|mwcomic\d*).(me|live|vip|fun|one|pro|city|space|cloud|co|online)/chapter/\d+/
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1107527
// @require      https://greasyfork.org/scripts/453330-coofoutils-tampermonkeyutils/code/coofoUtils-tampermonkeyUtils.js?version=1106599
// @require      https://greasyfork.org/scripts/453329-coofoutils-comicinfo/code/coofoUtils-comicInfo.js?version=1106598
// @connect      img.manwa.me
// @connect      img.manwa.live
// @connect      img.manwa.vip
// @connect      img.manwa.fun
// @connect      img.manwa.one
// @connect      img.manwa.pro
// @connect      img.manwa.city
// @connect      img.manwa.space
// @connect      img.manwa.cloud
// @connect      mwfimsvfast.co
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

/**
 * {
 *     zip: zip,
 *     bookInfo: {
 *         bookId: "",
 *         bookName: "",
 *         author: "",
 *         tag: "",
 *         summary: "",
 *     },
 *     types: [
 *         {
 *             parent: context,
 *             typeInfo: {
 *                 selectType: "water"
 *             },
 *             chapters: [
 *                 parent: type,
 *                 chapterInfo: {
 *                     chapterId: chapterId,
 *                     chapterName: chapterName,
 *                     idx: idx
 *                 },
 *                 images: [
 *                     parent: chapter,
 *                     imgUrl: imgUrl,
 *                     imageInfo: {
 *                         index: coofoUtils.commonUtils.format.num.fullNum(index, 3),
 *                         suffix: suffix
 *                     },
 *                     imageFile: null
 *                 ],
 *                 cbz: new JSZip(),
 *                 comicInfo: xml
 *             ]
 *         }
 *     ]
 * }
 */
(function (tools) {
    'use strict';
    //setting
    let setting = tools.setting;

    Object.assign(setting, {
        def: {
            imageNameTemplate: "${index}",
            /**
             * 文件名格式（包括路径）
             */
            cbzNameTemplate: "[manwa]/[${bookId}]${bookName}(${selectType})/[${idx_index3}][${chapterId}]${chapterName}",

            /**
             * zip文件名格式（包括路径）
             */
            zipNameTemplate: "[manwa][${bookId}]${bookName}"
        },

        /**
         * 下载线程数量
         * @type {number}
         */
        threadNum: 1,

        /**
         *
         */
        scrollSpeed: 800,

        scrollTimeout: 500,

        urlRetryTimes: 1,

        /**
         * 下载失败重试次数
         * @type {number}
         */
        downloadRetryTimes: 2,

        /**
         * all：我全都要
         * water：清水优先
         * adult：完整优先
         */
        selectType: "all"
    });

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
                             <tr><td>\${bookId}</td><td>漫画ID</td></tr>
                             <tr><td>\${bookName}</td><td>漫画名</td></tr>
                             <tr><td>\${selectType}</td><td>water/adult/all</td></tr>
                             <tr><td>\${chapterId}</td><td>章节ID</td></tr>
                             <tr><td>\${chapterName}</td><td>章节名</td></tr>
                             <tr><td>\${index}</td><td>插图序号</td></tr>
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

    if (tools.manwa.utils.isBookPage()) {
        //目录页

        //设置按钮
        GM_registerMenuCommand("删除该位置之后所有", function () {
            let editBtn = $("#user_js_edit");
            editBtn.text("删之后");
        });

        $("a.detail-bottom-btn").after('<a id="user_js_download" class="detail-bottom-btn" style="width: auto;padding: 0 15px;">⬇下载</a>');

        let btn = $("#user_js_download");
        //添加编辑按钮
        btn.after('<a id="user_js_edit" class="detail-bottom-btn" style="width: auto;padding: 0 15px;">删除项</a>');
        $("#user_js_edit").click(function () {
            let editBtn = $("#user_js_edit");
            if (editBtn.text() === "删除项") {
                editBtn.text("确定");
            } else if (editBtn.text() === "确定") {
                editBtn.text("删除项");
            }
        });

        $("li[idx]").click(function () {
            let editBtn = $("#user_js_edit");
            let btnText = editBtn.text();
            if (btnText === "删除项") {
                return true;
            } else if (btnText === "删之后") {
                let idx = $(this).attr("idx");
                let deleteAfter = false;
                $("li[idx]").toArray().forEach(li => {
                    if (deleteAfter) {
                        $(li).remove();
                    } else {
                        let thisIdx = $(li).attr("idx");
                        if (thisIdx === idx) {
                            deleteAfter = true;
                        }
                    }
                });
                editBtn.text("删除项");
                return false;
            } else {
                this.remove();
                return false;
            }
        });

        tools.runtime.downloadTask.showMsg = function (msg) {
            btn.html(msg);
        };

        btn.click(function () {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            Object.assign(setting, setting.def, GM_getValue("templateSetting", {}));

            let context = tools.runtime.downloadTask;

            //首页基础信息
            let url = window.location.href;

            Object.assign(context, {
                zip: new JSZip(),
                types: [],
                bookInfo: tools.manwa.utils.getBookInfo(url, $("body"))
            });

            let adultList = $("ul#adult-list-select li");
            let waterList = $("ul#detail-list-select li");
            if (setting.selectType === "all" || setting.selectType === "adult" || waterList.length <= 0) {
                //完整
                let adultType = {
                    parent: context,
                    typeInfo: {
                        selectType: "adult"
                    },
                    chapters: []
                };
                context.types.push(adultType);

                for (let i = 0; i < adultList.length; i++) {
                    let li = $(adultList[i]);
                    let idx = li.attr("idx");
                    let chapterUrl = li.find('a.chapteritem').attr("href");
                    let chapterId = chapterUrl.match(/(\d+)$/)[1];
                    let chapterName = li.find('a.chapteritem').attr("title");

                    let chapter = {
                        parent: adultType,
                        chapterInfo: {
                            chapterId: chapterId,
                            chapterName: chapterName,
                            idx: idx
                        },
                        url: chapterUrl,
                        images: [],
                        cbz: new JSZip(),
                        comicInfo: coofoUtils.comicInfoUtils.create({
                            Series: context.bookInfo.bookName,
                            Title: chapterName,
                            Number: Number(idx) + 1 + '',
                            Summary: context.bookInfo.summary,
                            Writer: context.bookInfo.author,
                            Publisher: 'manwa',
                            Tags: context.bookInfo.tag,
                            LanguageISO: 'zh'
                        })
                    };
                    adultType.chapters.push(chapter);
                }
            }

            if (setting.selectType === "all" || setting.selectType === "water" || adultList.length <= 0) {
                //清水
                let waterType = {
                    parent: context,
                    typeInfo: {
                        selectType: "water"
                    },
                    chapters: []
                };
                context.types.push(waterType);

                for (let i = 0; i < waterList.length; i++) {
                    let li = $(waterList[i]);
                    let idx = li.attr("idx");
                    let chapterUrl = li.find('a.chapteritem').attr("href");
                    let chapterId = chapterUrl.match(/(\d+)$/)[1];
                    let chapterName = li.find('a.chapteritem').attr("title");

                    let chapter = {
                        parent: waterType,
                        chapterInfo: {
                            chapterId: chapterId,
                            chapterName: chapterName,
                            idx: idx
                        },
                        url: chapterUrl,
                        images: [],
                        cbz: new JSZip(),
                        comicInfo: coofoUtils.comicInfoUtils.create({
                            Series: context.bookInfo.bookName,
                            Title: chapterName,
                            Number: Number(idx) + 1 + '',
                            Summary: context.bookInfo.summary,
                            Writer: context.bookInfo.author,
                            Publisher: 'manwa',
                            Tags: context.bookInfo.tag,
                            LanguageISO: 'zh'
                        })
                    };
                    waterType.chapters.push(chapter);

                }
            }

            Swal.fire({
                icon: 'warning',
                title: '自动下载中',
                html: `<div id="status"></div>`,
                footer: `请勿关闭该页面`,
                showConfirmButton: false
            });

            let postMsgInfo = {listener: null};
            let eventFunction = function (e) {
                console.log("get message");
                console.log(e);
                if (typeof postMsgInfo.listener === 'function') {
                    console.log("do message");
                    postMsgInfo.listener(e);
                }
            };
            console.log("init message EventListener");
            window.addEventListener("message", eventFunction);

            let cbzInfoArray = [];
            (async function () {
                type:
                    for (let i = 0; i < context.types.length; i++) {
                        let type = context.types[i];
                        for (let j = 0; j < type.chapters.length; j++) {
                            let chapter = type.chapters[j];
                            window.open(chapter.url);

                            let cbzInfo = await new Promise((resolve, reject) => {
                                postMsgInfo.listener = e => {
                                    if (e.origin === window.location.origin) {
                                        if (e.data === "auto download?") {
                                            console.log({
                                                msg: "auto download",
                                                bookInfo: context.bookInfo,
                                                typeInfo: chapter.parent.typeInfo,
                                                chapterInfo: chapter.chapterInfo,
                                            });
                                            e.source.postMessage({
                                                msg: "auto download",
                                                bookInfo: context.bookInfo,
                                                typeInfo: chapter.parent.typeInfo,
                                                chapterInfo: chapter.chapterInfo,
                                            }, window.location.origin);
                                        } else if (e.data.msg === "auto download success") {
                                            resolve(e.data.data);
                                        } else if (e.data === "auto download error") {
                                            // Swal.fire({
                                            //     title: "auto error",
                                            //     icon: "false"
                                            // });
                                            // reject();

                                            window.removeEventListener("message", eventFunction);
                                            alert("下载出现异常，中止下载");
                                            resolve("stop");
                                        } else if (e.data.msg === "auto download limited") {
                                            alert("访问被限制，中止下载");
                                            resolve("stop");
                                        }
                                    }
                                }
                            });

                            if (cbzInfo === "stop") {
                                break type;
                            }

                            cbzInfo.forEach(info => {
                                console.log(info);
                                cbzInfoArray.push(info);
                            });

                        }
                    }

                if (cbzInfoArray.length > 0) {
                    //创建zip
                    let zip = new JSZip();
                    console.log("cbzInfoArray size: " + cbzInfoArray.length);
                    cbzInfoArray.forEach(cbzInfo => zip.file(cbzInfo.name, cbzInfo.cbzFile));

                    let zipFile = await zip.generateAsync({type: "blob", compression: "STORE"});

                    let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));
                    let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(templateSetting.zipNameTemplate, context.bookInfo) + ".zip";

                    coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(zipFile, zipFileName);

                    Swal.fire({
                        title: "下载完成",
                        icon: "success"
                    });
                } else {

                    Swal.fire({
                        title: "下载内容为空",
                        icon: "warning"
                    });
                }
            })();
        });

    } else if (tools.manwa.utils.isChapterPage()) {
        //阅读页面


        //setting end
        let downloadBase = async function (bookInfo, typeInfo, chapterInfo) {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            Swal.fire({
                title: '下载中',
                html: `<div id="progressDT">下载</div>
                   <div><progress id="progressD" value="0" max="100" style="width: 100%;"></progress></div>`,
                showConfirmButton: false
            });

            //初始化命名规则
            let templateSetting = Object.assign({}, setting.def, GM_getValue("templateSetting", {}));
            setting.imageNameTemplate = templateSetting.imageNameTemplate;
            setting.cbzNameTemplate = templateSetting.cbzNameTemplate;
            setting.zipNameTemplate = templateSetting.zipNameTemplate;

            let context = tools.runtime.downloadTask;
            context.zip = new JSZip();
            context.bookInfo = bookInfo;
            context.types = [];

            let type = {
                parent: context,
                typeInfo: typeInfo,
                chapters: []
            };
            context.types.push(type);

            //ComicInfo.xml
            let xml = coofoUtils.comicInfoUtils.create({
                Series: bookInfo.bookName,
                Title: chapterInfo.chapterName,
                Number: Number(chapterInfo.idx) + 1 + '',
                Summary: bookInfo.summary,
                Writer: bookInfo.author,
                Publisher: 'manwa',
                Tags: bookInfo.tag,
                LanguageISO: 'zh'
            });

            let chapter = {
                parent: type,
                chapterInfo: chapterInfo,
                comicInfo: xml,
                images: [],
                cbz: new JSZip()
            };
            type.chapters.push(chapter);
            console.log("downloadBase", context);
            return context;
        };

        let downloadDif = async (bookInfo, typeInfo, chapterInfo) => await downloadBase(bookInfo, typeInfo, chapterInfo).then(async context => {

            let chapter = context.types[0].chapters[0];
            tools.manwa.utils.setImgs(chapter, $("body"));

            //执行下载操作
            let downloadPool = coofoUtils.service.threadPoolTaskExecutor.create(setting.threadNum);

            let downloadPromises = [];
            chapter.images.forEach(image => {
                tools.runtime.downloadTask.downloadTaskNum++;
                let downloadPromise = coofoUtils.service.retryablePromise.create((res, rej) => {
                    downloadPool.execute((resPool, rejPool) => {
                        tools.manwa.downloadHelp.zipDownloadTask({
                            success: resPool,
                            failed: rejPool
                        }, image)
                    }).then(r => res(r), r => rej(r));
                }, setting.downloadRetryTimes);
                downloadPromises.push(downloadPromise);
            });
            await Promise.all(downloadPromises);
            console.log("downloadDif", context);
            return context;
        });

        let downloadCbz = (bookInfo, typeInfo, chapterInfo) => downloadDif(bookInfo, typeInfo, chapterInfo).then(async context => {
            //创建cbz
            let cbzCompleteNum = 0;

            let cbzGenerateTasks = context.types[0].chapters
                .map(item => new Promise(resolve => tools.manwa.downloadHelp.generateCbz(item, () => {
                    cbzCompleteNum++;
                    tools.runtime.downloadTask.refreshStatus("打包", cbzCompleteNum, cbzGenerateTasks.length);
                    resolve();
                })));

            await Promise.all(cbzGenerateTasks);
            console.log("downloadCbz", context);
            return context;
        });

        //自动下载的
        let autoDownload = (bookInfo, typeInfo, chapterInfo) => downloadCbz(bookInfo, typeInfo, chapterInfo).then(async context => {
            tools.runtime.downloadTask.showFinished(tools.runtime.downloadTask.downloadTaskNum, 0);
            if (context.types[0].chapters.length <= 0) {
                return [];
            } else {
                return context.types[0].chapters.map(item => {
                    let info = Object.assign({}, item.parent.parent.bookInfo, item.parent.typeInfo, item.chapterInfo);
                    let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.cbzNameTemplate, info) + ".cbz";
                    let cbzFile = item.cbzFile;
                    //释放
                    item.cbzFile = null;
                    return {name: name, cbzFile: cbzFile};
                });
            }
        });

        let nomalDownload = (bookInfo, typeInfo, chapterInfo) => downloadCbz(bookInfo, typeInfo, chapterInfo).then(context => {
            return new Promise(resolve => tools.manwa.downloadHelp.generateZip(context, zipFile => resolve(zipFile)))
        }).then(zipFile => {
            //触发下载
            let context = tools.runtime.downloadTask;
            let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, context.bookInfo) + ".zip";
            coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(zipFile, zipFileName);
            tools.runtime.downloadTask.showFinished(tools.runtime.downloadTask.downloadedTaskNum, 0);
        }, r => {
            Swal.fire('下载失败', r, 'error');
        });

        //下载监听
        if (typeof window.opener === 'object' && window.opener != null) {
            console.log({opener: window.opener});
            (async function () {
                console.log("init message EventListener");
                window.addEventListener("message", e => {
                    console.log(e);

                    if (e.origin !== window.location.origin || e.data.msg !== "auto download") {
                        return;
                    }
                    //自动下载

                    Swal.fire({
                        icon: 'warning',
                        title: '自动下载中',
                        html: `<div id="status"></div>`,
                        footer: `请勿关闭该页面`,
                        showConfirmButton: false
                    });

                    if ($("body").text().includes("如果你看到这个讯息，你可能使用了其他不正常浏览器（或是快速打开多个分页）")) {
                        window.opener.postMessage({
                            msg: "auto download limited",
                            data: null
                        }, e.origin);
                        window.close();
                        return;
                    }

                    let status = $("#status");
                    tools.runtime.downloadTask.showMsg = function (msg) {
                        status.html(msg);
                    };

                    (async function () {
                        let scrollTop = -1;
                        do {
                            let newScrollTop = document.documentElement.scrollTop;
                            if (newScrollTop === scrollTop) {
                                break;
                            }
                            scrollTop = newScrollTop;
                            window.scroll({top: scrollTop + setting.scrollSpeed, behavior: 'smooth'});
                            await new Promise(resolve => setTimeout(() => resolve(), setting.scrollTimeout))
                        } while (true);
                        console.log("滚动结束");

                        autoDownload(e.data.bookInfo, e.data.typeInfo, e.data.chapterInfo)
                            .then(
                                cbzInfoArray => {
                                    Swal.fire("自动下载成功", "该页面将自动关闭", "success");
                                    window.opener.postMessage({
                                        msg: "auto download success",
                                        data: cbzInfoArray
                                    }, e.origin);
                                }, () => {
                                    Swal.fire("自动下载失败", null, "error");
                                    window.opener.postMessage("auto download error", e.origin);
                                })
                            .then(() => window.close());
                    })();
                });

                await new Promise(resolve => setTimeout(() => resolve(), 0));
                console.log("send auto download?");
                window.opener.postMessage("auto download?", window.location.origin);
            })();
        }

        //添加下载按钮
        GM_registerMenuCommand("下载", function () {
            let bookUrl = $("div.view-fix-top-bar-right a").toArray()
                .map(a => a.href)
                .filter(href => href.indexOf("/book/") >= 0)[0];
            $.ajax({
                url: bookUrl,
                type: 'get',
                contentType: "text/html; charset=utf-8",
                success: function (request) {
                    let div = document.createElement("div");
                    div.innerHTML = request;
                    let divSelector = $(div);
                    let bookInfo = tools.manwa.utils.getBookInfo(bookUrl, divSelector);
                    let typeChapterInfo = tools.manwa.utils.getTypeChapterInfo(window.location.href, divSelector);
                    nomalDownload(bookInfo, typeChapterInfo.typeInfo, typeChapterInfo.chapterInfo);
                },
                error: () => {
                    Swal.fire('下载失败', '获取bookInfo页面失败', 'error');
                }
            });
        });
    }


})((function () {
    const constants = {};
    const cache = {};

    const tools = {
        setting: {},
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
                    $('#progressGT').html(`解析 （${completeNum}/${totalNum}）`);
                    let progress = $('#progressG');
                    progress.attr("value", completeNum);
                    progress.attr("max", totalNum);
                    tools.runtime.downloadTask.refreshStatus("解析地址", completeNum, totalNum);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.downloadedTaskNum;
                    let totalNum = tools.runtime.downloadTask.downloadTaskNum;
                    $('#progressDT').html(`下载 （${completeNum}/${totalNum}）`);
                    let progress = $('#progressD');
                    progress.attr("value", completeNum);
                    progress.attr("max", totalNum);
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


        manwa: {
            regex: {
                bookUrl: /^https:\/\/(manwa|mwcomic\d*).[a-zA-Z]+\/book\/(\d+)/,
                chapterUrl: /https:\/\/(manwa|mwcomic\d*).[a-zA-Z]+\/chapter\/(\d+)/,
                archiveUrl: /^https:\/\/healthywawa.com\/archives\/(\d+)/,
                dataUrl: /^https:\/\/manwa.[a-zA-Z]+\/forInject\/(\d+).html/
            },
            utils: {
                isBookPage: function () {
                    let url = window.location.href;
                    return url.match(tools.manwa.regex.bookUrl) != null;
                },
                isChapterPage: function () {
                    let url = window.location.href;
                    return url.match(tools.manwa.regex.chapterUrl) != null;
                },
                getBookId: function (url) {
                    let urlMatch = url.match(tools.manwa.regex.bookUrl);
                    if (urlMatch == null) {
                        return null;
                    }
                    return urlMatch[2];
                },
                getImgUrl: function (divSelector) {
                    let imgUrls = [];
                    let imgs = divSelector.find("div.view-main-1 img.content-img");
                    for (let i = 0; i < imgs.length; i++) {
                        imgUrls[i] = $(imgs[i]).attr("data-r-src");
                    }
                    let info = {
                        // bookId: divSelector.find("div.view-fix-top-bar-right a").attr("href").match(tools.manwa.regex.bookUrl)[1],
                        // bookName: divSelector.find("div.view-fix-top-bar-center-right-book-name").text().trim(),
                        chapterName: divSelector.find("div.view-fix-top-bar-center-right-chapter-name").text().trim(),
                    };
                    return {imgUrls: imgUrls, info: info};
                },
                setImgs: function (chapter, divSelector) {
                    let imgItems = [];
                    let imgs = divSelector.find("div.view-main-1 img.content-img");
                    for (let i = 0; i < imgs.length; i++) {
                        let imgUrl = $(imgs[i]).attr("data-r-src")

                        let noQUrl;
                        let qIdx = imgUrl.lastIndexOf('?');
                        if (qIdx < 0) {
                            noQUrl = imgUrl;
                        } else {
                            noQUrl = imgUrl.substring(0, qIdx);
                        }
                        let suffix = coofoUtils.commonUtils.format.file.getSuffix(noQUrl);
                        if (suffix.length > 0) {
                            suffix = "." + suffix;
                        }
                        let img = {
                            parent: chapter,
                            imgUrl: imgUrl,
                            imageInfo: {
                                index: coofoUtils.commonUtils.format.num.fullNum(i + 1, 3),
                                suffix: suffix
                            },
                            imageFile: null
                        };
                        imgItems.push(img);
                        chapter.images = imgItems;
                    }
                },
                getBookInfo(url, selector) {
                    return {
                        bookId: tools.manwa.utils.getBookId(url),
                        bookName: selector.find("div.detail-main .detail-main-info-title").text(),
                        author: selector.find("p.detail-main-info-author:contains(作者) a").toArray().map(o => $(o).text()).join(','),
                        tag: selector.find(".info-tag-span").toArray().map(o => $(o).text()).join(','),
                        summary: selector.find(".detail-desc").text()
                    }
                },
                getTypeChapterInfo(url, bookDivSelector) {
                    let chapterId = url.match(/(\d+)$/)[1];
                    let adultList = bookDivSelector.find("ul#adult-list-select li");
                    let waterList = bookDivSelector.find("ul#detail-list-select li");
                    let getChapterId = li => li.find('a.chapteritem').attr("href").match(/(\d+)$/)[1];
                    // let getIdx = li => li.attr("idx");
                    let getChapterName = li => li.find('a.chapteritem').attr("title");

                    for (let i = 0; i < adultList.length; i++) {
                        let li = $(adultList[i]);
                        let liChapterId = getChapterId(li);
                        if (liChapterId === chapterId) {
                            return {
                                typeInfo: {
                                    selectType: "adult"
                                },
                                chapterInfo: {
                                    chapterId: chapterId,
                                    chapterName: getChapterName(li),
                                    idx: i
                                }
                            };
                        }
                    }
                    for (let i = 0; i < waterList.length; i++) {
                        let li = $(waterList[i]);
                        let liChapterId = getChapterId(li);
                        if (liChapterId === chapterId) {
                            return {
                                typeInfo: {
                                    selectType: "water"
                                },
                                chapterInfo: {
                                    chapterId: chapterId,
                                    chapterName: getChapterName(li),
                                    idx: i
                                }
                            };
                        }
                    }

                    return {};
                }
            },
            api: {
                getImgUrl: function (chapterId, onSuccess, onError, onComplete) {
                    $.ajax({
                        url: `/chapter/${chapterId}`,
                        type: 'get',
                        contentType: "text/html; charset=utf-8",
                        success: function (request) {
                            // console.log(request);
                            if (request.includes("如果你看到这个讯息，你可能使用了其他不正常浏览器（或是快速打开多个分页）")) {
                                onError();
                                return;
                            }
                            let div = document.createElement("div");
                            div.innerHTML = request;

                            let m = tools.manwa.utils.getImgUrl($(div));

                            Object.assign(m.info, {chapterId: chapterId});

                            onSuccess(m.imgUrls, m.info);
                        },
                        error: onError,
                        complete: onComplete
                    });
                },
            },
            downloadHelp: {
                generateTask: function (taskItem, chapter) {
                    tools.manwa.api.getImgUrl(chapter.chapterInfo.chapterId, function (imgUrls, info) {
                        if (imgUrls.length <= 0) {
                            //如果获取到的图片列表为空，则为获取失败
                            taskItem.failed();
                            return;
                        }
                        for (let j = 0; j < imgUrls.length; j++) {
                            let imgUrl = imgUrls[j];

                            let noQUrl;
                            let qIdx = imgUrl.lastIndexOf('?');
                            if (qIdx < 0) {
                                noQUrl = imgUrl;
                            } else {
                                noQUrl = imgUrl.substring(0, qIdx);
                            }
                            let suffix = coofoUtils.commonUtils.format.file.getSuffix(noQUrl);
                            if (suffix.length > 0) {
                                suffix = "." + suffix;
                            }
                            let index = j + 1;
                            chapter.images.push({
                                parent: chapter,
                                imgUrl: imgUrl,
                                imageInfo: {
                                    index: coofoUtils.commonUtils.format.num.fullNum(index, 3),
                                    suffix: suffix
                                },
                                imageFile: null
                            });
                        }

                        taskItem.success();
                        tools.runtime.downloadTask.generatedTaskNum++;
                        tools.runtime.downloadTask.refreshGenerateStatus();
                    }, function () {
                        taskItem.failed();
                    });
                },
                zipDownloadTask: function (taskItem, image) {
                    let url = coofoUtils.commonUtils.format.url.fullUrl(image.imgUrl);
                    let request = new XMLHttpRequest;
                    request.open("GET", url, !0);
                    request.responseType = "arraybuffer";
                    request.onload = function () {
                        if (200 === request.status) {
                            let r = request.response;
                            let a = "my2ecret782ecret";
                            let i = CryptoJS.enc.Utf8.parse(a);
                            let l = CryptoJS.lib.WordArray.create(r);
                            let e = CryptoJS.AES.decrypt({ciphertext: l}, i, {iv: i, padding: CryptoJS.pad.Pkcs7});
                            let o = function (e) {
                                const t = e.sigBytes, r = e.words, a = new Uint8Array(t);
                                for (let n = 0, s = 0; n != t;) {
                                    let i = r[s++];
                                    if (a[n++] = (4278190080 & i) >>> 24, n == t) break;
                                    if (a[n++] = (16711680 & i) >>> 16, n == t) break;
                                    if (a[n++] = (65280 & i) >>> 8, n == t) break;
                                    a[n++] = 255 & i
                                }
                                return a
                            };
                            image.imageFile = o(e);
                            taskItem.success();
                            tools.runtime.downloadTask.downloadedTaskNum++;
                            tools.runtime.downloadTask.refreshDownLoadStatus();
                        } else {
                            console.error("download error: " + url);
                            console.error(a.status);
                            taskItem.failed();
                        }
                    };
                    request.onerror = () => {
                        taskItem.failed();
                    };
                    request.send();
                },
                generateCbz: function (chapter, onFinished) {
                    if (chapter.images.length <= 0) {
                        //当不存在图片时
                        chapter.cbz = null;
                        onFinished();
                    } else {
                        chapter.images.forEach(image => {
                            let info = Object.assign({}, image.parent.parent.parent.bookInfo, image.parent.parent.typeInfo, image.parent.chapterInfo, image.imageInfo);
                            let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.imageNameTemplate, info) + image.imageInfo.suffix;
                            chapter.cbz.file(name, image.imageFile);
                            //释放
                            image.imageFile = null;
                        });
                        chapter.cbz.file("ComicInfo.xml", chapter.comicInfo);
                        chapter.cbz.generateAsync({type: "blob", compression: "STORE"})
                            .then(context => {
                                chapter.cbzFile = context;
                                //释放
                                chapter.cbz = null;
                                onFinished();
                            });
                    }
                },
                generateZip: function (context, onFinished) {
                    context.types
                        .flatMap(type => type.chapters)
                        .forEach(chapter => {
                            let info = Object.assign({}, chapter.parent.parent.bookInfo, chapter.parent.typeInfo, chapter.chapterInfo);
                            let name = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.cbzNameTemplate, info) + ".cbz";
                            context.zip.file(name, chapter.cbzFile);
                            //释放
                            chapter.cbzFile = null;
                        });


                    context.zip.generateAsync({type: "blob", compression: "STORE"})
                        .then(onFinished);
                    //释放
                    context.zip = null;
                },
                fileNameService: {
                    getFileName: function (downloadTaskInfo) {
                        let setting = tools.setting;
                        return coofoUtils.commonUtils.format.string.filePathByMap(setting.fileNameTemplate, downloadTaskInfo) + downloadTaskInfo.suffix;
                    }
                },


            }
        }
    };
    return tools;
})());