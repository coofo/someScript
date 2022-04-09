// ==UserScript==
// @name         myreadingmanga下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  下载
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/myreadingmanga.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://myreadingmanga.info/[a-z-]+/?/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1037847
// @connect      myreadingmanga.info
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
    setting.fileNameTemplate = "[myreadingmanga]/${bookName}/${chapter}/${index}";
    setting.fileNameTemplate0 = "[myreadingmanga]/${bookName}/${index}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[myreadingmanga]${bookName}";

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
    let h1 = document.querySelector("header.entry-header h1");
    //首页基础信息
    let baseInfo = {
        bookName: h1.innerHTML
    };

    let btn = document.createElement("a");
    btn.id = "user_js_download";
    btn.style.color = "green";
    btn.style.fontWeight = "600";
    btn.style.fontSize = "2.4rem";
    btn.innerText = "⬇下载";
    h1.parentNode.insertBefore(btn, h1.nextElementSibling);
    // h1.append(btn);
    // h1.after();

    tools.runtime.downloadTask.showMsg = function (msg) {
        btn.innerText = msg;
    };

    btn.onclick = function () {
        if (tools.runtime.nowDownloading) return;
        tools.runtime.nowDownloading = true;


        if (tools.setting.downloadMode === "zip") {
            tools.runtime.downloadTask.zip = new JSZip();
        }

        let aList = jQuery("div.pagination a");
        let generateTask = coofoUtils.service.task.create();
        let downloadTask = coofoUtils.service.task.create();
        tools.runtime.downloadTask.generateTask = generateTask;
        tools.runtime.downloadTask.downloadTask = downloadTask;

        let baseAdultInfo = Object.assign({
            downloadTask: downloadTask,
        }, baseInfo);

        if (aList === null || aList.length <= 0) {
            let info = Object.assign({
                chapter: "",
                url: window.location.href,
                fileNameTemplate: "[myreadingmanga]/${bookName}/${index}"
            }, baseAdultInfo);

            generateTask.api.addTask(tools.myreadingmanga.downloadHelp.generateTask, info, setting.downloadRetryTimes);
        } else {
            let urls = [];
            let currentIndex = jQuery("div.pagination span span.custom-page-links").html();
            urls[currentIndex] = window.location.href;

            for (let i = 0; i < aList.length; i++) {
                let a = jQuery(aList[i]);
                let index = a.find("span.custom-page-links").html();
                if (index.match(/^\d+$/) === null) {
                    continue;
                }
                urls[index] = a.attr("href");

            }

            for (let i = 0; i < urls.length; i++) {
                if (!urls[i]) {
                    continue;
                }
                let info = Object.assign({
                    url: urls[i],
                    chapter: i,
                    fileNameTemplate: "[myreadingmanga]/${bookName}/${chapter}/${index}"
                }, baseAdultInfo);
                generateTask.api.addTask(tools.myreadingmanga.downloadHelp.generateTask, info, setting.downloadRetryTimes);
            }
        }

        generateTask.runtime.callBack = function () {
            let list = generateTask.runtime.taskList;
            if (list.length <= 0) {
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

            if(downloadTask.runtime.taskList.length <= 0){
                tools.runtime.downloadTask.showMsg("下载目标为0");
                return;
            }
            for (let i = 0; i < setting.threadNum; i++) {
                downloadTask.api.exec(i);
            }
        };
        for (let i = 0; i < setting.threadNum; i++) {
            generateTask.api.exec(i);
        }
    };


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

        myreadingmanga: {
            regex: {
                bookUrl: /^https:\/\/myreadingmanga.info\/[a-z-]+\/?/
            },
            api: {
                getImgUrl: function (url, onSuccess, onError, onComplete) {
                    jQuery.ajax({
                        url: url,
                        type: 'get',
                        contentType: 'text/html; charset=UTF-8',
                        success: function (request) {
                            let div = document.createElement("div");
                            div.innerHTML = request;
                            let imgUrls = [];
                            let imgList = jQuery(div).find('div.entry-content img[data-lazy-src]');
                            for (let i = 0; i < imgList.length; i++) {
                                let img = imgList[i];
                                imgUrls.push(jQuery(img).attr("data-lazy-src"));
                            }
                            onSuccess(imgUrls)
                        },
                        error: onError,
                        complete: onComplete
                    });
                }
            }, downloadHelp: {
                generateTask: function (taskInfo, taskItem) {
                    tools.myreadingmanga.api.getImgUrl(taskInfo.url, function (imgUrls) {
                        for (let i = 0; i < imgUrls.length; i++) {
                            let imgUrl = imgUrls[i];
                            let suffix = coofoUtils.commonUtils.format.file.getSuffix(imgUrl);
                            if (suffix.length > 0) {
                                suffix = "." + suffix;
                            }
                            let index = i + 1;
                            let infoEx = Object.assign({
                                imgUrl: imgUrl,
                                index: coofoUtils.commonUtils.format.num.fullNum(index, 3),
                                suffix: suffix
                            }, taskInfo);

                            let downloadFunction;
                            if (tools.setting.downloadMode === "single") {
                                downloadFunction = tools.myreadingmanga.downloadHelp.singleDownloadTask;
                            } else {
                                downloadFunction = tools.myreadingmanga.downloadHelp.zipDownloadTask;
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
                    let fileName = tools.myreadingmanga.downloadHelp.fileNameService.getFileName(taskInfo);
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
                    let fileName = tools.myreadingmanga.downloadHelp.fileNameService.getFileName(taskInfo);
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
                        return coofoUtils.commonUtils.format.string.byMap(downloadTaskInfo.fileNameTemplate, downloadTaskInfo) + downloadTaskInfo.suffix;
                    }
                },
            },
        },


    };

    return tools;
})());