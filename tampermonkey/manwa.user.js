// ==UserScript==
// @name         manwa图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.1.6
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://manwa.(me|live|vip|fun)/book/\d+/
// @require      https://cdn.bootcdn.net/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1083480
// @connect      img.manwa.me
// @connect      img.manwa.live
// @connect      img.manwa.vip
// @connect      img.manwa.fun
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// ==/UserScript==


(function (tools) {
    'use strict';
    //setting
    let setting = tools.setting;
    /**
     * 文件名格式（包括路径）
     * ${bookId}        漫画ID
     * ${bookName}      漫画名
     * ${selectType}    water/adult
     * ${chapterId}     章节ID
     * ${chapterName}   章节名
     * ${index}         插图序号
     */
    setting.fileNameTemplate = "[manwa]/[${bookId}]${author_squareBracket}${bookName}(${selectType})/[${idx_index3}][${chapterId}]${chapterName}/${index}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[manwa][${bookId}]${author_squareBracket}${bookName}";

    /**
     * 下载线程数量
     * @type {number}
     */
    setting.threadNum = 3;
    /**
     * 下载模式
     * single：将图片文件单个下载（如果需要保存的文件有文件夹结构，则需要将tampermonkey下载模式调整为【浏览器API】）
     * zip：将图片打成zip包下载
     */
    setting.downloadMode = "zip";

    /**
     * 下载失败重试次数
     * @type {number}
     */
    setting.downloadRetryTimes = 2;

    /**
     * all：我全都要
     * water：清水优先
     * adult：完整优先
     */
    setting.selectType = "all";

    //setting end

    console.log(GM_info.downloadMode);

    //首页基础信息
    let url = window.location.href;
    let urlMatch = url.match(tools.manwa.regex.bookUrl);

    let tagList = $(".info-tag-span");
    let tagStrList = [];
    for (let i = 0; i < tagList.length; i++) {
        tagStrList.push($(tagList[i]).html());
    }

    let baseInfo = {
        bookId: urlMatch[1],
        bookName: $("div.detail-main p.detail-main-info-title").html(),
        author: $("p.detail-main-info-author:contains(作者) a").html(),
        tag: tagStrList.join(','),
        summary: $(".detail-desc").text()
    };

    $("a.detail-bottom-btn").after('<a id="user_js_download" class="detail-bottom-btn">⬇下载</a>');

    let btn = $("#user_js_download");
    tools.runtime.downloadTask.showMsg = function (msg) {
        btn.html(msg);
    };
    btn.click(function () {
        if (tools.runtime.nowDownloading) return;
        tools.runtime.nowDownloading = true;


        if (tools.setting.downloadMode === "zip") {
            tools.runtime.downloadTask.zip = new JSZip();
        }

        let adultList = $("ul#adult-list-select li");
        let waterList = $("ul#detail-list-select li");
        let generateTask = coofoUtils.service.task.create();
        let downloadTask = coofoUtils.service.task.create();
        tools.runtime.downloadTask.generateTask = generateTask;
        tools.runtime.downloadTask.downloadTask = downloadTask;
        let generateTaskFunc = function (taskInfo, taskItem) {
            setTimeout(() => tools.manwa.downloadHelp.generateTask(taskInfo, taskItem), 500);
        };

        if (setting.selectType === "all" || setting.selectType === "adult" || waterList.length <= 0) {
            //完整
            let baseAdultInfo = Object.assign({
                selectType: "adult",
                downloadTask: downloadTask,
            }, baseInfo);

            for (let i = 0; i < adultList.length; i++) {
                let li = $(adultList[i]);
                let idx = li.attr("idx");
                let chapterId = li.find('a.chapteritem').attr("href").match(/(\d+)$/)[1];

                let info = Object.assign({
                    chapterId: chapterId,
                    idx: idx
                }, baseAdultInfo);

                generateTask.api.addTask(generateTaskFunc, info, setting.downloadRetryTimes);
            }
        }

        if (setting.selectType === "all" || setting.selectType === "water" || adultList.length <= 0) {
            //清水
            let baseWaterInfo = Object.assign({
                selectType: "water",
                downloadTask: downloadTask,
            }, baseInfo);
            for (let i = 0; i < waterList.length; i++) {
                let li = $(waterList[i]);
                let idx = li.attr("idx");
                let chapterId = li.find('a.chapteritem').attr("href").match(/(\d+)$/)[1];

                let info = Object.assign({
                    chapterId: chapterId,
                    idx: idx
                }, baseWaterInfo);

                generateTask.api.addTask(generateTaskFunc, info, setting.downloadRetryTimes);
            }
        }


        generateTask.runtime.callBack = function () {
            let list = generateTask.runtime.taskList;
            if (list.length <= 0) {
                tools.runtime.downloadTask.showMsg("下载目标为0");
                return;
            }
            downloadTask.runtime.callBack = function (completeNum, retryTimesOutNum) {
                if (tools.setting.downloadMode === "zip") {
                    tools.runtime.downloadTask.zip.generateAsync({type: "blob"}).then(function (content) {
                        let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, baseInfo) + ".zip";

                        coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                        tools.runtime.downloadTask.showFinished(completeNum, retryTimesOutNum);
                    });
                }
                tools.runtime.downloadTask.showFinished(completeNum, retryTimesOutNum);
            };

            for (let i = 0; i < setting.threadNum; i++) {
                downloadTask.api.exec(i);
            }
        };
        for (let i = 0; i < 1; i++) {
            generateTask.api.exec(i);
        }
    });


    // span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;"  id="span_download_test">⬇下载测试</span>');
    // $("#span_download_test").click(function () {
    // });


})((function () {
    const constants = {};
    const cache = {};

    const tools = {
        setting: {pass: ""},
        runtime: {
            nowDownloading: false,
            downloadTask: {
                zip: null,
                generateTask: null,
                getGeneratedNum: function () {
                    if (this.generateTask == null) {
                        return 0;
                    }
                    let i = 0;
                    let list = this.generateTask.runtime.taskList;
                    for (let j = 0; j < list.length; j++) {
                        if (list[j].complete === true) {
                            i++;
                        }
                    }
                    return i;
                },
                downloadTask: null,
                getDownloadedNum: function () {
                    if (this.downloadTask == null) {
                        return 0;
                    }
                    let i = 0;
                    let list = this.downloadTask.runtime.taskList;
                    for (let j = 0; j < list.length; j++) {
                        if (list[j].complete === true) {
                            i++;
                        }
                    }
                    return i;
                },
                showMsg: function (msg) {
                    console.log(msg);
                },
                refreshGenerateStatus: function () {
                    let completeNum = tools.runtime.downloadTask.getGeneratedNum();
                    let totalNum = tools.runtime.downloadTask.generateTask.runtime.taskList.length;
                    let digitNum;
                    if(totalNum > 1000){
                        digitNum = 2;
                    }else if(totalNum > 100){
                        digitNum = 1;
                    }else {
                        digitNum = 0;
                    }
                    let percent = coofoUtils.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, digitNum) + "%";
                    tools.runtime.downloadTask.showMsg("解析地址 " + percent);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.getDownloadedNum();
                    let totalNum = tools.runtime.downloadTask.downloadTask.runtime.taskList.length;
                    let digitNum;
                    if(totalNum > 1000){
                        digitNum = 2;
                    }else if(totalNum > 100){
                        digitNum = 1;
                    }else {
                        digitNum = 0;
                    }
                    let percent = coofoUtils.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, digitNum) + "%";
                    tools.runtime.downloadTask.showMsg("下载 " + percent);
                },
                showFinished: function (completeNum, retryTimesOutNum) {
                    let msg = "下载完成：" + completeNum;
                    if (retryTimesOutNum > 0) {
                        msg = msg + " - " + retryTimesOutNum;
                    }
                    this.showMsg(msg);
                    tools.runtime.downloadTask.generateTask = null;
                    tools.runtime.downloadTask.downloadTask = null;
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
                                // bookName: divSelector.find("div.view-fix-top-bar-center-right-book-name").html().trim(),
                                chapterId: chapterId,
                                chapterName: divSelector.find("div.view-fix-top-bar-center-right-chapter-name").html().trim(),
                            };
                            onSuccess(imgUrls, info);
                        },
                        error: onError,
                        complete: onComplete
                    });
                },
            },
            downloadHelp: {
                generateTask: function (taskInfo, taskItem) {
                    tools.manwa.api.getImgUrl(taskInfo.chapterId, function (imgUrls, info) {

                        for (let j = 0; j < imgUrls.length; j++) {
                            let imgUrl = imgUrls[j];

                            let noQUrl;
                            let qIdx = imgUrl.lastIndexOf('?');
                            if (qIdx < 0) {
                                noQUrl = imgUrl;
                            } else {
                                noQUrl = imgUrl.substring(0,qIdx);
                            }
                            let suffix = coofoUtils.commonUtils.format.file.getSuffix(noQUrl);
                            if (suffix.length > 0) {
                                suffix = "." + suffix;
                            }
                            let index = j + 1;
                            let infoEx = Object.assign({
                                imgUrl: imgUrl,
                                index: coofoUtils.commonUtils.format.num.fullNum(index, 3),
                                suffix: suffix
                            }, info, taskInfo);

                            let downloadFunction;
                            if (tools.setting.downloadMode === "single") {
                                downloadFunction = tools.manwa.downloadHelp.singleDownloadTask;
                            } else {

                                if (imgUrls.length > 0) {
                                    let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(Object.assign({
                                        index: "ComicInfo",
                                        suffix: ".xml"
                                    }, info, taskInfo));
                                    let xml = coofoUtils.comicInfoUtils.create({
                                        Series: infoEx.bookName,
                                        Title: infoEx.chapterName,
                                        Number: Number(infoEx.idx) + 1 + '',
                                        Summary: infoEx.summary,
                                        Writer: infoEx.author,
                                        Publisher: 'manwa',
                                        Tags: infoEx.tag,
                                        LanguageISO:'zh'

                                    });
                                    tools.runtime.downloadTask.zip.file(fileName, xml);
                                }

                                downloadFunction = tools.manwa.downloadHelp.zipDownloadTask;
                            }
                            taskInfo.downloadTask.api.addTask(downloadFunction, infoEx, tools.setting.downloadRetryTimes);
                        }

                        taskItem.success();
                        tools.runtime.downloadTask.refreshGenerateStatus();
                    }, function () {
                        taskItem.failed();
                    });
                },
                singleDownloadTask: function (taskInfo, taskItem) {
                    let url = coofoUtils.commonUtils.format.url.fullUrl(taskInfo.imgUrl);
                    let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(taskInfo);
                    coofoUtils.tampermonkeyUtils.downloadHelp.toUser.asGMdownload(taskInfo.imgUrl, fileName, {
                        gmDownload: {
                            saveAs: false,
                            onload: function () {
                                taskItem.success();
                                tools.runtime.downloadTask.refreshDownLoadStatus();
                            },
                            onerror: function (e) {
                                console.error("GM_download error: " + url);
                                console.error(e);
                                taskItem.failed();
                            },
                            ontimeout: function (e) {
                                console.error("GM_download timeout");
                                console.error(e);
                                taskItem.failed();
                            }
                        }
                    });
                },
                zipDownloadTask: function (taskInfo, taskItem) {
                    let url = coofoUtils.commonUtils.format.url.fullUrl(taskInfo.imgUrl);
                    let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(taskInfo);

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
                            tools.runtime.downloadTask.zip.file(fileName, o(e));
                            taskItem.success();
                            tools.runtime.downloadTask.refreshDownLoadStatus();
                        }else{
                            console.error("download error: " + url);
                            console.error(a.status);
                            taskItem.failed();
                        }
                    };
                    request.send();


                    // coofoUtils.tampermonkeyUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                    //     if (responseDetails.status === 200) {
                    //         tools.runtime.downloadTask.zip.file(fileName, responseDetails.response);
                    //         taskItem.success();
                    //         tools.runtime.downloadTask.refreshDownLoadStatus();
                    //     } else {
                    //         console.error("download error: " + url);
                    //         console.error(responseDetails);
                    //         taskItem.failed();
                    //     }
                    // })
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