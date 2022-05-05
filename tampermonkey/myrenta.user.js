// ==UserScript==
// @name         myrenta图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.7
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://reader.myrenta.com/viewer/sc/viewer_aws/[0-9a-z]+/[\d-]+/type_(6|10)/index.html$/
// @require      https://cdn.bootcdn.net/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1047387
// @connect      myrenta-books.*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// ==/UserScript==


(function (tools) {
    'use strict';    //setting
    let setting = tools.setting;
    /**
     * 文件名格式（包括路径）
     * ${itemId}       漫画ID
     * ${title}        漫画名
     * ${index}        插图序号
     */
    setting.fileNameTemplate = "[myrenta]/${itemId_squareBracket}${title}/${index_index4}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[myrenta]${itemId_squareBracket}${title}";

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

    let url = window.location.href;
    let urlMatch = url.match(tools.myrenta.regex.bookDetailUrl);

    let baseInfo = {
        title: $("p.title span").html(),
        itemId: urlMatch[3]
    };

    //添加按钮
    if (urlMatch[4] === "6") {
        $("div.btnBox").after('<div class="btnBox"><a href="javascript:;" id="user_js_download" style="width: auto;padding: 0 10px 0 10px;background-size: 100% 100%;">⬇下载</a></div>');
    } else {
        $("a.chapter-prev").after(`<a id="user_js_download" class="chapter-btn" href="javascript:;">⬇下载</a>`);
    }


    let btn = $("#user_js_download");
    tools.runtime.downloadTask.showMsg = function (msg) {
        btn.html(msg);
    };

    btn.click(function () {
        if (tools.runtime.nowDownloading) return;
        tools.runtime.nowDownloading = true;

        tools.runtime.downloadTask.zip = new JSZip();

        let generateTask = coofoUtils.service.task.create();
        let downloadTask = coofoUtils.service.task.create();
        tools.runtime.downloadTask.generateTask = generateTask;
        tools.runtime.downloadTask.downloadTask = downloadTask;

        tools.myrenta.api.getBookInfo(urlMatch[1], urlMatch[2], function (bookInfo) {
            baseInfo.prdId = bookInfo.prd_id;
            for (let i = 0; i < bookInfo.dimension.length; i++) {
                let info = Object.assign({
                    ext: bookInfo.ext,
                    key: bookInfo.key,
                    page: i + 1,
                    index: i + 1,
                    suffix: "." + bookInfo.ext,
                    downloadTask: downloadTask
                }, baseInfo);
                generateTask.api.addTask(tools.myrenta.downloadHelp.generateTask, info, setting.downloadRetryTimes);
            }

            generateTask.runtime.callBack = function () {
                for (let i = 0; i < setting.threadNum; i++) {
                    downloadTask.api.exec(i);
                }
            };

            downloadTask.runtime.callBack = function (completeNum, retryTimesOutNum) {
                tools.runtime.downloadTask.zip.generateAsync({type: "blob"}).then(function (content) {
                    let zipFileName = coofoUtils.commonUtils.format.string.filePathByMap(tools.setting.zipNameTemplate, baseInfo) + ".zip";

                    coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(content, zipFileName);
                    tools.runtime.downloadTask.showFinished(completeNum, retryTimesOutNum);
                });
            };

            for (let i = 0; i < setting.threadNum; i++) {
                generateTask.api.exec(i);
            }

        });

    });


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
        myrenta: {
            regex: {
                bookDetailUrl: new RegExp("^https://reader.myrenta.com/viewer/sc/viewer_aws/([0-9a-z]+)/([0-9]+-([0-9]+)-[0-9]+)/type_(6|10)/index.html$")
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
                generateTask: function (taskInfo, taskItem) {
                    // console.log(taskInfo);
                    tools.myrenta.api.getImgUrl(taskInfo.ext, taskInfo.prdId, taskInfo.page, 6, function (request) {
                        let imgUrlJson = CryptoJS.AES.decrypt(request, taskInfo.key, {format: CryptoJSAesJson}).toString(CryptoJS.enc.Utf8);
                        taskInfo.imgUrl = JSON.parse(imgUrlJson);
                        taskInfo.downloadTask.api.addTask(tools.myrenta.downloadHelp.downloadTask, taskInfo, tools.setting.downloadRetryTimes);

                        taskItem.success();
                        tools.runtime.downloadTask.refreshGenerateStatus();
                    }, function () {
                        taskItem.failed();
                    });
                },
                downloadTask: function (taskInfo, taskItem) {
                    let fileName = tools.myrenta.downloadHelp.fileNameService.getFileName(taskInfo);

                    if (true) {
                        //get
                        let request = new XMLHttpRequest();
                        request.open("GET", taskInfo.imgUrl);
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
                                        tools.runtime.downloadTask.zip.file(fileName, arrayBufferView);
                                        taskItem.success();
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