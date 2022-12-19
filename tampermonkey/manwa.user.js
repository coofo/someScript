// ==UserScript==
// @name         manwa图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.2.11
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://manwa.(me|live|vip|fun|one|pro|city|space|cloud)/book/\d+/
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


(function (tools) {
    'use strict';
    //setting
    let setting = tools.setting;

    Object.assign(setting, {
        def: {
            imageNameTemplate:"${index}",
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
        threadNum: 8,

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
        let urlMatch = url.match(tools.manwa.regex.bookUrl);

        Object.assign(context, {
            zip: new JSZip(),
            types: [],
            bookInfo: {
                bookId: urlMatch[1],
                bookName: $("div.detail-main p.detail-main-info-title").text(),
                author: $("p.detail-main-info-author:contains(作者) a").toArray().map(o => $(o).text()).join(','),
                tag: $(".info-tag-span").toArray().map(o => $(o).text()).join(','),
                summary: $(".detail-desc").text()
            }
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
                let chapterId = li.find('a.chapteritem').attr("href").match(/(\d+)$/)[1];
                let chapterName = li.find('a.chapteritem').attr("title");

                let chapter = {
                    parent: adultType,
                    chapterInfo: {
                        chapterId: chapterId,
                        chapterName: chapterName,
                        idx: idx
                    },
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
                let chapterId = li.find('a.chapteritem').attr("href").match(/(\d+)$/)[1];
                let chapterName = li.find('a.chapteritem').attr("title");

                let chapter = {
                    parent: waterType,
                    chapterInfo: {
                        chapterId: chapterId,
                        chapterName: chapterName,
                        idx: idx
                    },
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
            title: '下载中',
            html: `<div id="progressGT">解析</div>
                   <div><progress id="progressG" value="0" max="100" style="width: 100%;"></progress></div>
                   <div id="progressDT">下载</div>
                   <div><progress id="progressD" value="0" max="100" style="width: 100%;"></progress></div>`,
            showConfirmButton: false
        });

        let getUrlPool = coofoUtils.service.threadPoolTaskExecutor.create(1);
        let downloadPool = coofoUtils.service.threadPoolTaskExecutor.create(setting.threadNum);
        let resolve;
        let reject;
        let promise = new Promise((res, rej) => {
            resolve = res;
            reject = rej;
        });

        let promises = [];
        for (let iType = 0; iType < context.types.length; iType++) {
            let type = context.types[iType];
            for (let iChapter = 0; iChapter < type.chapters.length; iChapter++) {
                let chapter = type.chapters[iChapter];
                tools.runtime.downloadTask.generateTaskNum++;
                let chapterPromise = coofoUtils.service.retryablePromise.create((res, rej) => {
                    //获取图片url
                    getUrlPool.execute((resPool, rejPool) => {
                        setTimeout(() => tools.manwa.downloadHelp.generateTask({
                            success: resPool,
                            failed: rejPool
                        }, chapter), 500)
                    }).then(r => res(r), r => rej(r));

                }, setting.downloadRetryTimes).then(() => {
                    //下载图片
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
                    return Promise.all(downloadPromises);
                }).then(() => {
                    //创建cbz
                    return new Promise(res => {
                        tools.manwa.downloadHelp.generateCbz(chapter, () => {
                            //TODO show
                            res();
                        });
                    })
                });

                promises.push(chapterPromise);
            }
        }
        Promise.all(promises).then(() => resolve(), r => reject(r));

        promise.then(() => {
            //创建zip
            return new Promise(resolve => tools.manwa.downloadHelp.generateZip(context, zipFile => resolve(zipFile)))
        }).then(zipFile => {
            //触发下载
            let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, context.bookInfo) + ".zip";
            coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(zipFile, zipFileName);
            tools.runtime.downloadTask.showFinished(tools.runtime.downloadTask.downloadedTaskNum, 0);
            Swal.fire({
                icon: 'success',
                title: '下载完成'
            });
        }, r => {
            Swal.fire('下载失败', r, 'error');
        });
    });





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
                    progress.attr("value",completeNum);
                    progress.attr("max",totalNum);
                    tools.runtime.downloadTask.refreshStatus("解析地址", completeNum, totalNum);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.downloadedTaskNum;
                    let totalNum = tools.runtime.downloadTask.downloadTaskNum;
                    $('#progressDT').html(`下载 （${completeNum}/${totalNum}）`);
                    let progress = $('#progressD');
                    progress.attr("value",completeNum);
                    progress.attr("max",totalNum);
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
                bookUrl: /^https:\/\/manwa.[a-zA-Z]+\/book\/(\d+)/,
                archiveUrl: /^https:\/\/healthywawa.com\/archives\/(\d+)/,
                dataUrl: /^https:\/\/manwa.[a-zA-Z]+\/forInject\/(\d+).html/
            },
            utils: {
                isBookPage: function () {
                    let url = window.location.href;
                    return url.match(tools.manwa.regex.bookUrl) != null;
                },
            },
            api: {
                getImgUrl: function (chapterId, onSuccess, onError, onComplete) {
                    $.ajax({
                        url: `/chapter/${chapterId}`,
                        type: 'get',
                        contentType: "text/html; charset=utf-8",
                        success: function (request) {
                            // console.log(request);

                            let div = document.createElement("div");
                            div.innerHTML = request;
                            let imgUrls = [];
                            let divSelector = $(div);
                            let imgs = divSelector.find("div.view-main-1 img.content-img");
                            for (let i = 0; i < imgs.length; i++) {
                                imgUrls[i] = $(imgs[i]).attr("data-r-src");
                            }
                            // if (imgUrls.length <= 0) {
                            //     tools.manwa.utils.tagZeroImgItem(uid, iid);
                            // }

                            let info = {
                                // bookId: divSelector.find("div.view-fix-top-bar-right a").attr("href").match(tools.manwa.regex.bookUrl)[1],
                                // bookName: divSelector.find("div.view-fix-top-bar-center-right-book-name").text().trim(),
                                chapterId: chapterId,
                                chapterName: divSelector.find("div.view-fix-top-bar-center-right-chapter-name").text().trim(),
                            };
                            onSuccess(imgUrls, info);
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
                        if(200 === request.status){
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
                        }else{
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