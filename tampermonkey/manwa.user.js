// ==UserScript==
// @name         manwa图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  下载
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://manwa.me/book/\d+/
// @include      /^https://healthywawa.com/archives/\d+/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @connect      img.manwa.me
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
     * ${chapterName}   章节名
     * ${index}         插图序号
     */
    setting.fileNameTemplate = "[manwa]/[${bookId}]${bookName}/[${chapterId}]${chapterName}/${index}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[manwa][${bookId}]${bookName}";

    /**
     * 是否同步下载
     * @type {boolean}
     */
    setting.sync = true;
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

    console.log(GM_info.downloadMode)


    if (tools.manwa.utils.isBookPage()) {
        $("a.detail-bottom-btn").after('<a id="user_js_download" class="detail-bottom-btn">⬇下载</a>');

        let btn = $("#user_js_download");
        tools.runtime.downloadTask.showMsg = function (msg) {
            btn.html(msg);
        };
        btn.click(function () {
            let aList = $("ul#detail-list-select li a.chapteritem");
            for (let i = 0; i < aList.length; i++) {
                let chapterId = $(aList[i]).attr("href").match(/jmud\((\d+)\)/)[1];
                tools.manwa.downloadHelp.addItem(chapterId);
            }
            tools.manwa.downloadHelp.generateDownloadList(function () {
                tools.manwa.downloadHelp.doDownload();
            })
        });
    }


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
                waitItemList: [],
                getGeneratedNum: function () {
                    let i = 0;
                    for (let j = 0; j < this.waitItemList.length; j++) {
                        if (this.waitItemList[j].complete === true) {
                            i++;
                        }
                    }
                    return i;
                },
                waitDownloadList: [],
                getDownloadedNum: function () {
                    let i = 0;
                    for (let j = 0; j < this.waitDownloadList.length; j++) {
                        if (this.waitDownloadList[j].complete === true) {
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
                    let totalNum = tools.runtime.downloadTask.waitItemList.length;
                    let percent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                    tools.runtime.downloadTask.showMsg("解析地址 " + percent);
                },
                refreshDownLoadStatus: function () {
                    let completeNum = tools.runtime.downloadTask.getDownloadedNum();
                    let totalNum = tools.runtime.downloadTask.waitDownloadList.length;
                    let percent = tools.commonUtils.format.num.toThousands(completeNum / totalNum * 100, null, 0) + "%";
                    tools.runtime.downloadTask.showMsg("下载 " + percent);
                },
                showFinished: function () {
                    this.showMsg("下载完成：" + tools.runtime.downloadTask.getDownloadedNum());
                },
                clear: function () {
                    this.waitItemList = [];
                    this.waitDownloadList = [];
                    this.showMsg = function (msg) {
                        console.log(msg);
                    }
                }
            }
        },
        commonUtils: {
            format: {
                num: {
                    fullNum: function (num, length) {
                        return (Array(length).join('0') + num).slice(-length);
                    },
                    toThousands: function (value, seperator, digitNum) {
                        if ((value = ((value = value + "").replace(/^\s*|\s*$|,*/g, ''))).match(/^\d*\.?\d*$/) == null)
                            return value;
                        value = digitNum >= 0 ? (Number(value).toFixed(digitNum) + "") : value;
                        let r = [],
                            tl = value.split(".")[0],
                            tr = value.split(".")[1];
                        tr = typeof tr !== "undefined" ? tr : "";
                        if (seperator != null && seperator !== "") {
                            while (tl.length >= 3) {
                                r.push(tl.substring(tl.length - 3));
                                tl = tl.substring(0, tl.length - 3);
                            }
                            if (tl.length > 0)
                                r.push(tl);
                            r.reverse();
                            r = r.join(seperator);
                            return tr === "" ? r : r + "." + tr;
                        }
                        return value;
                    }
                },
                file: {
                    getSuffix: function (name) {
                        let index = name.lastIndexOf('.');
                        if (index < 0) {
                            return "";
                        } else {
                            return name.substring(index + 1);
                        }
                    }
                },
                string: {
                    byMap: function (str, map) {
                        let reg = new RegExp('\\${([a-z][a-zA-Z0-9_.]+)}', 'g');
                        return str.replace(reg, function (match, pos, originalText) {
                            let key = match.replace(reg, '$1');
                            let value = map[key];
                            if (value === null || value === undefined) {
                                return match;
                            } else {
                                return value;
                            }
                        });
                    }
                },
                url: {
                    fullUrl: function (url) {
                        if (url.match(/^[a-zA-Z0-9]+:\/\//) !== null) {
                            return url;
                        } else if (url.match(/^\/\/[a-zA-Z0-9]+/) !== null) {
                            return window.location.protocol + url;
                        } else if (url.match(/^\/[a-zA-Z0-9]+/) !== null) {
                            return window.location.origin + url;
                        } else {
                            return url;
                        }
                    }
                }
            },
            assert: {
                isTrue: function (value, message) {
                    if (true !== value) {
                        console.error(message);
                        console.error(value);
                        throw message;
                    }
                },
                isNull: function (value, message) {
                    if (value !== null) {
                        console.error(message);
                        console.error(value);
                        throw message;
                    }
                },
                notNull: function (value, message) {
                    if (value === null) {
                        console.error(message);
                        console.error(value);
                        throw message;
                    }
                },
                hasLength: function (value, message) {
                    if (!(value !== null && value.length > 0)) {
                        console.error(message);
                        console.error(value);
                        throw message;
                    }
                },
            },
            downloadHelp: {
                toBlob: {
                    asBlob: function (url, onSuccess) {
                        GM_xmlhttpRequest({
                            method: "GET",
                            url: url,
                            responseType: "arraybuffer",
                            onload: function (responseDetails) {
                                onSuccess(responseDetails);
                            }
                        });
                    }
                },
                toUser: {
                    asTagA4Url: function (url, fileName) {
                        let aLink = document.createElement('a');
                        if (fileName) {
                            aLink.download = fileName;
                        } else {
                            aLink.download = url.substring(url.lastIndexOf('/') + 1);
                        }
                        aLink.className = 'download-temp-node';
                        aLink.target = "_blank";
                        aLink.style = "display:none;";
                        aLink.href = url;
                        document.body.appendChild(aLink);
                        if (document.all) {
                            aLink.click(); //IE
                        } else {
                            let evt = document.createEvent("MouseEvents");
                            evt.initEvent("click", true, true);
                            aLink.dispatchEvent(evt); // 其它浏览器
                        }
                        document.body.removeChild(aLink);
                    },
                    asTagA4Blob: function (content, fileName) {
                        if ('msSaveOrOpenBlob' in navigator) {
                            navigator.msSaveOrOpenBlob(content, fileName);
                        } else {
                            let aLink = document.createElement('a');
                            aLink.className = 'download-temp-node';
                            aLink.download = fileName;
                            aLink.style = "display:none;";
                            let blob = new Blob([content], {type: content.type});
                            aLink.href = window.URL.createObjectURL(blob);
                            document.body.appendChild(aLink);
                            if (document.all) {
                                aLink.click(); //IE
                            } else {
                                let evt = document.createEvent("MouseEvents");
                                evt.initEvent("click", true, true);
                                aLink.dispatchEvent(evt); // 其它浏览器
                            }
                            window.URL.revokeObjectURL(aLink.href);
                            document.body.removeChild(aLink);
                        }
                    },
                    asGMdownload: function (url, fileName, setting) {
                        let details;
                        if (typeof setting === "object" && typeof setting.gmDownload === "object") {
                            details = setting.gmDownload;
                        } else {
                            details = {saveAs: false};
                        }
                        details.url = url;
                        details.name = fileName;
                        // console.log(details.url);
                        // console.log(details.name);
                        GM_download(details);
                    }
                }
            },
        },

        manwa: {
            regex: {
                bookUrl: /^https:\/\/manwa.me\/book\/(\d+)/,
                archiveUrl: /^https:\/\/healthywawa.com\/archives\/(\d+)/,
                dataUrl: /^https:\/\/manwa.me\/forInject\/(\d+).html/
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
                        // url: "https://manwa.me/forInject/653939.html?f=fozcRotntz13bQBoXcsulA==",
                        url: `https://manwa.me/forInject/${chapterId}.html`,
                        type: 'get',
                        contentType: "text/html; charset=utf-8",
                        success: function (request) {
                            // console.log(request);

                            let div = document.createElement("div");
                            div.innerHTML = request;
                            let imgUrls = [];
                            let divSelector = $(div);
                            let imgs = divSelector.find("div.view-main-1 img");
                            for (let i = 0; i < imgs.length; i++) {
                                imgUrls[i] = $(imgs[i]).attr("data-original");
                            }
                            // if (imgUrls.length <= 0) {
                            //     tools.manwa.utils.tagZeroImgItem(uid, iid);
                            // }

                            let info = {
                                bookId: divSelector.find("div.view-fix-top-bar-right a").attr("href").match(tools.manwa.regex.bookUrl)[1],
                                bookName: divSelector.find("div.view-fix-top-bar-center-right-book-name").html().trim(),
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
                addItem: function (chapterId) {
                    tools.runtime.downloadTask.waitItemList.push({
                        chapterId: chapterId,
                        complete: false
                    });
                },
                generateDownloadList: function (onFinish) {
                    tools.runtime.downloadTask.showMsg("解析地址 0%");
                    let list = tools.runtime.downloadTask.waitItemList;
                    for (let i = 0; i < list.length; i++) {
                        tools.manwa.api.getImgUrl(list[i].chapterId, function (imgUrls, info) {
                            list[i].complete = true;
                            tools.runtime.downloadTask.refreshGenerateStatus();

                            for (let j = 0; j < imgUrls.length; j++) {
                                let imgUrl = imgUrls[j];
                                let suffix = tools.commonUtils.format.file.getSuffix(imgUrl);
                                if (suffix.length > 0) {
                                    suffix = "." + suffix;
                                }
                                let index = j + 1;
                                let infoEx = {
                                    bookId: info.bookId,
                                    bookName: info.bookName,
                                    chapterId: info.chapterId,
                                    chapterName: info.chapterName,
                                    index: tools.commonUtils.format.num.fullNum(index, 3),
                                    suffix: suffix
                                };
                                tools.manwa.downloadHelp.addDownloadList(imgUrl, infoEx)
                            }

                            if (tools.runtime.downloadTask.getGeneratedNum() >= tools.runtime.downloadTask.waitItemList.length) {
                                onFinish();
                            }
                        });
                    }
                },
                addDownloadList: function (url, info) {
                    tools.runtime.downloadTask.waitDownloadList.push({
                        url: url,
                        info: info,
                        complete: false,
                        lastRetryTimes: tools.setting.downloadRetryTimes
                    });
                },
                doDownload: function () {
                    let list = tools.runtime.downloadTask.waitDownloadList;
                    if (list.length <= 0) {
                        tools.runtime.downloadTask.showMsg("下载目标为0");
                        return;
                    }
                    if (tools.setting.sync === false) {
                        this.downloadService.async.exec();
                    } else {
                        this.downloadService.sync.exec();
                    }
                },
                fileNameService: {
                    getFileName: function (downloadItem) {
                        let setting = tools.setting;
                        let map = downloadItem.info;
                        return tools.commonUtils.format.string.byMap(setting.fileNameTemplate, map) + map.suffix;
                    }
                },


                //-----------------------------------------
                downloadService: {
                    async: {
                        exec: function () {
                            let onSuccess;
                            let downloadFunction;
                            let setting = tools.setting;
                            switch (setting.downloadMode) {
                                case "single":
                                    downloadFunction = this.downloadItemSingle;
                                    onSuccess = function () {
                                        tools.runtime.downloadTask.refreshDownLoadStatus();
                                        let downloadTask = tools.runtime.downloadTask;
                                        if (downloadTask.getDownloadedNum() >= downloadTask.waitDownloadList.length) {
                                            tools.runtime.downloadTask.showFinished();
                                        }
                                    };
                                    break;
                                case "zip":
                                default:
                                    downloadFunction = this.downloadItemZip;
                                    let zip = new JSZip();
                                    onSuccess = function (fileName, arrayBuffer, map) {
                                        zip.file(fileName, arrayBuffer);

                                        tools.runtime.downloadTask.refreshDownLoadStatus();
                                        let downloadTask = tools.runtime.downloadTask;
                                        if (downloadTask.getDownloadedNum() >= downloadTask.waitDownloadList.length) {
                                            zip.generateAsync({type: "blob"}).then(function (content) {

                                                let info = {
                                                    bookId: map.bookId,
                                                    bookName: map.bookName,
                                                    chapterId: "",
                                                    chapterName: "",
                                                    index: ""
                                                };
                                                // if (tools.manwa.utils.isDetailPage()) {
                                                //     id = map.id;
                                                // }

                                                let zipFileName = tools.commonUtils.format.string.byMap(setting.zipNameTemplate, info) + ".zip";
                                                tools.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                                                tools.runtime.downloadTask.showFinished();
                                            });
                                        }
                                    };
                                    break;
                            }

                            let list = tools.runtime.downloadTask.waitDownloadList;
                            for (let i = 0; i < list.length; i++) {
                                let downloadItem = list[i];
                                downloadFunction(downloadItem, onSuccess);
                            }
                        },
                        downloadItemSingle(downloadItem, onSuccess) {
                            let url = tools.commonUtils.format.url.fullUrl(downloadItem.url);
                            let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(downloadItem);
                            tools.commonUtils.downloadHelp.toUser.asGMdownload(url, fileName, {
                                gmDownload: {
                                    saveAs: false,
                                    onload: function () {
                                        downloadItem.complete = true;
                                        onSuccess();
                                    },
                                    onerror: function (e) {
                                        console.error("GM_download error: " + url);
                                        console.error(e);
                                        if (downloadItem.lastRetryTimes > 0) {
                                            setTimeout((function () {
                                                downloadItem.lastRetryTimes--;
                                                tools.manwa.downloadHelp.downloadService.async.downloadItemSingle(downloadItem, onSuccess);
                                            }), 2000)
                                        } else {
                                            console.error("超过重试限制");
                                        }

                                    },
                                    ontimeout: function (e) {
                                        console.error("GM_download timeout");
                                        console.error(e);
                                        if (downloadItem.lastRetryTimes > 0) {
                                            setTimeout((function () {
                                                downloadItem.lastRetryTimes--;
                                                tools.manwa.downloadHelp.downloadService.async.downloadItemSingle(downloadItem, onSuccess);
                                            }), 2000)
                                        } else {
                                            console.error("超过重试限制");
                                        }
                                    }
                                }
                            });
                        },
                        downloadItemZip(downloadItem, onSuccess) {
                            let map = downloadItem.info;
                            let url = downloadItem.url;
                            let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(downloadItem);
                            tools.commonUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                                if (responseDetails.status === 200) {
                                    downloadItem.complete = true;
                                    onSuccess(fileName, responseDetails.response, map);
                                } else {
                                    console.error("download error: " + url);
                                    console.error(responseDetails);
                                    if (downloadItem.lastRetryTimes > 0) {
                                        setTimeout((function () {
                                            downloadItem.lastRetryTimes--;
                                            tools.manwa.downloadHelp.downloadService.async.downloadItemZip(downloadItem, onSuccess);
                                        }), 2000)
                                    } else {
                                        console.error("超过重试限制");
                                    }
                                }
                            });
                        }
                    },
                    sync: {
                        exec: function () {
                            let setting = tools.setting;
                            switch (setting.downloadMode) {
                                case "single":
                                    this.downloadItemSingle(0);
                                    break;
                                case "zip":
                                default:
                                    tools.runtime.downloadTask.zip = new JSZip();
                                    this.downloadItemZip(0);
                                    break;
                            }
                        },
                        downloadItemSingle: function (index) {
                            let orgIndex = index;
                            let list = tools.runtime.downloadTask.waitDownloadList;
                            if (index >= list.length) {
                                setTimeout((function () {
                                    tools.manwa.downloadHelp.downloadService.sync.downloadItemSingle(0);
                                }), 500);
                                return;
                            }
                            do {
                                let downloadItem = list[index];
                                if (!downloadItem.complete) {
                                    if (downloadItem.lastRetryTimes > 0) {
                                        let url = tools.commonUtils.format.url.fullUrl(downloadItem.url);
                                        let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(downloadItem);
                                        tools.commonUtils.downloadHelp.toUser.asGMdownload(url, fileName, {
                                            gmDownload: {
                                                saveAs: false,
                                                onload: function () {
                                                    downloadItem.complete = true;
                                                    tools.runtime.downloadTask.refreshDownLoadStatus();
                                                    tools.manwa.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);
                                                },
                                                onerror: function (e) {
                                                    console.error("GM_download error: " + url);
                                                    console.error(e);
                                                    downloadItem.lastRetryTimes--;
                                                    tools.manwa.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);

                                                },
                                                ontimeout: function (e) {
                                                    console.error("GM_download timeout");
                                                    console.error(e);
                                                    downloadItem.lastRetryTimes--;
                                                    tools.manwa.downloadHelp.downloadService.sync.downloadItemSingle(index + 1);
                                                }
                                            }
                                        });
                                        return;
                                    } else {
                                        console.error("超过重试限制：" + downloadItem.url);
                                    }
                                }

                                index++;
                            } while (index < list.length);
                            if (orgIndex === 0) {
                                tools.runtime.downloadTask.showFinished();
                            } else {
                                tools.manwa.downloadHelp.downloadService.sync.downloadItemSingle(index);
                            }
                        },
                        downloadItemZip: function (index) {
                            let orgIndex = index;
                            let list = tools.runtime.downloadTask.waitDownloadList;
                            if (index >= list.length) {
                                setTimeout((function () {
                                    tools.manwa.downloadHelp.downloadService.sync.downloadItemZip(0);
                                }), 500);
                                return;
                            }
                            let downloadItem;
                            do {
                                downloadItem = list[index];
                                if (!downloadItem.complete) {
                                    if (downloadItem.lastRetryTimes > 0) {
                                        let url = downloadItem.url;
                                        let fileName = tools.manwa.downloadHelp.fileNameService.getFileName(downloadItem);
                                        tools.commonUtils.downloadHelp.toBlob.asBlob(url, function (responseDetails) {
                                            if (responseDetails.status === 200) {
                                                tools.runtime.downloadTask.zip.file(fileName, responseDetails.response);
                                                downloadItem.complete = true;
                                                tools.runtime.downloadTask.refreshDownLoadStatus();
                                                tools.manwa.downloadHelp.downloadService.sync.downloadItemZip(index + 1);
                                            } else {
                                                console.error("download error: " + url);
                                                console.error(responseDetails);
                                                downloadItem.lastRetryTimes--;
                                                tools.manwa.downloadHelp.downloadService.sync.downloadItemZip(index + 1);
                                            }
                                        });
                                        return;
                                    } else {
                                        console.error("超过重试限制：" + downloadItem.url);
                                    }
                                }

                                index++;
                            } while (index < list.length);
                            if (orgIndex === 0) {

                                tools.runtime.downloadTask.zip.generateAsync({type: "blob"}).then(function (content) {
                                    let map = downloadItem.info;

                                    let info = {
                                        bookId: map.bookId,
                                        bookName: map.bookName,
                                        chapterId: "",
                                        chapterName: "",
                                        index: ""
                                    };

                                    // if (tools.poipiku.utils.isDetailPage()) {
                                    //     id = map.id;
                                    // }

                                    let zipFileName = tools.commonUtils.format.string.byMap(tools.setting.zipNameTemplate, info) + ".zip";
                                    tools.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                                    tools.runtime.downloadTask.showFinished();
                                });
                                tools.runtime.downloadTask.zip = null;
                            } else {
                                tools.manwa.downloadHelp.downloadService.sync.downloadItemZip(index);
                            }
                        }
                    }
                },
            }
        },

    };

    return tools;
})());