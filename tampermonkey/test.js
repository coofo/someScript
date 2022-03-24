// ==UserScript==
// @name         task test
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  任务系统测试
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/manwa.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @include      /^https://manwa.me/book/\d+/
// @include      /^https://healthywawa.com/archives/\d+/
// @require      https://cdn.bootcss.com/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1031698
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
     * ${selectType}    water/adult
     * ${chapterId}     章节ID
     * ${chapterName}   章节名
     * ${index}         插图序号
     */
    setting.fileNameTemplate = "[manwa]/[${bookId}]${bookName}(${selectType})/[${chapterId}]${chapterName}/${index}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.zipNameTemplate = "[manwa][${bookId}]${bookName}";

    /**
     * 下载线程数量
     * @type {number}
     */
    setting.threadNum = 4;
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


    // if (tools.manwa.utils.isBookPage()) {
    if (tools.runtime.nowDownloading) return;
    tools.runtime.nowDownloading = true;
    $("a.detail-bottom-btn").after('<a id="user_js_download" class="detail-bottom-btn">⬇下载</a>');

    let btn = $("#user_js_download");
    tools.runtime.downloadTask.showMsg = function (msg) {
        btn.html(msg);
    };
    btn.click(function () {
        // let adultList = $("ul#adult-list-select li a.chapteritem");
        // let waterList = $("ul#detail-list-select li a.chapteritem");
        //
        // if (setting.selectType === "all" || setting.selectType === "adult" || waterList.length <= 0) {
        //     //完整
        //     let info = {selectType: "adult"};
        //     for (let i = 0; i < adultList.length; i++) {
        //         let chapterId = $(adultList[i]).attr("href").match(/jmud\((\d+)\)/)[1];
        //         tools.manwa.downloadHelp.addItem(chapterId, info);
        //     }
        // }
        //
        // if (setting.selectType === "all" || setting.selectType === "water" || adultList.length <= 0) {
        //     //清水
        //     let info = {selectType: "water"};
        //     for (let i = 0; i < waterList.length; i++) {
        //         let chapterId = $(waterList[i]).attr("href").match(/jmud\((\d+)\)/)[1];
        //         tools.manwa.downloadHelp.addItem(chapterId, info);
        //     }
        // }
        if (typeof(Worker) !== "undefined") {
            console.log("是的！支持 Web worker！");
        } else {
            console.log("抱歉！不支持 Web Worker！");
        }
        if (typeof(coofoUtils) !== "undefined") {
            console.log("是的！支持 Web worker！");
        } else {
            console.log("抱歉！不支持 Web Worker！");
        }
        let taskService = coofoUtils.service.task.create(function () {
            console.log("finished");
        });
        for (let i = 0; i < 30; i++) {
            taskService.api.addTask(function (taskInfo, taskItem) {
                console.log(taskInfo.index + "start");
                setTimeout((function () {
                    console.log(taskInfo.index + "end");
                    taskItem.success();
                }), 1000)
            }, {index: i}, 0)
        }
        for (let i = 0; i < setting.threadNum; i++) {
            taskService.api.exec(i);
        }
        // tools.manwa.downloadHelp.generateDownloadList(function () {
        //     tools.manwa.downloadHelp.doDownload();
        // })
    });
    // }


    // span.before('<span class="BtnBase UserInfoCmdFollow UserInfoCmdFollow_581115" style="margin-right: 10px;"  id="span_download_test">⬇下载测试</span>');
    // $("#span_download_test").click(function () {
    // });


})((function () {
    let tools = {
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
        }
    };
    return tools;
})());