// ==UserScript==
// @name         yandanshe图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.3
// @license      AGPL License
// @description  下载
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/yandanshe.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://yandanshe.com/\d+/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1031855
// @connect      i.yandanshe.com
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
     * ${chapterId}     章节ID
     * ${index}         插图序号
     */
    setting.fileNameTemplate = "[yandanshe]/[${bookId}][${author}]${bookName}/${chapterId}/${index}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[yandanshe][${bookId}][${author}]${bookName}";

    /**
     * 下载线程数量
     * @type {number}
     */
    setting.threadNum = 5;
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


    //setting end

    console.log(GM_info.downloadMode);

    //首页基础信息
    let url = window.location.href;
    let urlMatch = url.match(tools.yandanshe.regex.bookUrl);
    let postMeta = $("div.post-meta");
    let baseInfo = {
        bookId: urlMatch[1],
        bookName: $("h1.post-title").html(),
        author: postMeta.children("a").first().html()
    };
    console.log(baseInfo);

    postMeta.after('<a href="javascript::" class="btn btn-primary btn-sm btn-rounded" id="user_js_download">⬇下载</a>');

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

        let generateTask = coofoUtils.service.task.create();
        let downloadTask = coofoUtils.service.task.create();
        tools.runtime.downloadTask.generateTask = generateTask;
        tools.runtime.downloadTask.downloadTask = downloadTask;

        //处理当前页
        let urlList = [url];

        $("a.post-page-numbers").each(function (index, element) {
            urlList.push(element.href);
        });
        for (let i = 0; i < urlList.length; i++) {
            let info = Object.assign({
                chapterUrl: urlList[i],
                downloadTask: downloadTask
            }, baseInfo);
            generateTask.api.addTask(tools.yandanshe.downloadHelp.generateTask, info, setting.downloadRetryTimes);
        }

        generateTask.runtime.callBack = function () {
            let list = generateTask.runtime.taskList;
            if (list.length <= 0 && downloadTask.runtime.taskList.length <= 0) {
                tools.runtime.downloadTask.showMsg("下载目标为0");
                return;
            }
            downloadTask.runtime.callBack = function () {
                let list = downloadTask.runtime.taskList;
                let completeNum = 0;
                for (let i = 0; i < list.length; i++) {
                    if (list[i].complete === true) completeNum++;
                }

                if (tools.setting.downloadMode === "zip") {
                    tools.runtime.downloadTask.zip.generateAsync({type: "blob"}).then(function (content) {
                        let zipFileName = coofoUtils.commonUtils.format.string.byMap(tools.setting.zipNameTemplate, baseInfo) + ".zip";

                        coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                        tools.runtime.downloadTask.showFinished();
                    });
                } else {
                    tools.runtime.downloadTask.showFinished();
                }
            };

            for (let i = 0; i < setting.threadNum; i++) {
                downloadTask.api.exec(i);
            }
        };

        for (let i = 0; i < setting.threadNum; i++) {
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
                    if (totalNum > 1000) {
                        digitNum = 2;
                    } else if (totalNum > 100) {
                        digitNum = 1;
                    } else {
                        digitNum = 0;
                    }
                    let percent = coofoUtils.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, digitNum) + "%";
                    tools.runtime.downloadTask.showMsg("解析地址 " + percent);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.getDownloadedNum();
                    let totalNum = tools.runtime.downloadTask.downloadTask.runtime.taskList.length;
                    let digitNum;
                    if (totalNum > 1000) {
                        digitNum = 2;
                    } else if (totalNum > 100) {
                        digitNum = 1;
                    } else {
                        digitNum = 0;
                    }
                    let percent = coofoUtils.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, digitNum) + "%";
                    tools.runtime.downloadTask.showMsg("下载 " + percent);
                },
                showFinished: function () {
                    this.showMsg("下载完成：" + tools.runtime.downloadTask.getDownloadedNum());
                    tools.runtime.downloadTask.generateTask = null;
                    tools.runtime.downloadTask.downloadTask = null;
                }
            }
        },

        yandanshe: {
            regex: {
                bookUrl: /^https:\/\/yandanshe.com\/(\d+)/,
                // archiveUrl: /^https:\/\/healthywawa.com\/archives\/(\d+)/,
                // dataUrl: /^https:\/\/manwa.me\/forInject\/(\d+).html/
            },
            html: {
                getImgUrls: function (selected) {
                    let urlList = [];
                    selected.find("div.post-content img.aligncenter").each(function (index, element) {
                        urlList.push(element.dataset.src);
                    });
                    let chapterId = selected.find("span.current").html();
                    return {urlList, chapterId};
                }
            },
            api: {
                getImgUrl: function (chapterUrl, onSuccess, onError, onComplete) {
                    $.ajax({
                        url: chapterUrl,
                        type: 'get',
                        contentType: "text/html; charset=utf-8",
                        success: function (request) {
                            // console.log(request);

                            let div = document.createElement("div");
                            div.innerHTML = request;
                            let htmlInfo = tools.yandanshe.html.getImgUrls($(div));
                            let imgUrls = htmlInfo.urlList;

                            let info = {
                                chapterId: coofoUtils.commonUtils.format.num.fullNum(htmlInfo.chapterId, 3),
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
                    tools.yandanshe.api.getImgUrl(taskInfo.chapterUrl, function (imgUrls, info) {

                        for (let j = 0; j < imgUrls.length; j++) {
                            let imgUrl = imgUrls[j];

                            let suffix = coofoUtils.commonUtils.format.file.getSuffix(imgUrl);
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
                                downloadFunction = tools.yandanshe.downloadHelp.singleDownloadTask;
                            } else {
                                downloadFunction = tools.yandanshe.downloadHelp.zipDownloadTask;
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
                    let fileName = tools.yandanshe.downloadHelp.fileNameService.getFileName(taskInfo);
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
                    let fileName = tools.yandanshe.downloadHelp.fileNameService.getFileName(taskInfo);
                    coofoUtils.tampermonkeyUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                        if (responseDetails.status === 200) {
                            tools.runtime.downloadTask.zip.file(fileName, responseDetails.response);
                            taskItem.success();
                            tools.runtime.downloadTask.refreshDownLoadStatus();
                        } else {
                            console.error("download error: " + url);
                            console.error(responseDetails);
                            taskItem.failed();
                        }
                    })
                },
                fileNameService: {
                    getFileName: function (downloadTaskInfo) {
                        let setting = tools.setting;
                        return coofoUtils.commonUtils.format.string.byMap(setting.fileNameTemplate, downloadTaskInfo) + downloadTaskInfo.suffix;
                    }
                },


            }
        }
    };

    return tools;
})());