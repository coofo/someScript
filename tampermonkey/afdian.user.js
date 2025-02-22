// ==UserScript==
// @name         爱发电图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/afdian.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/afdian.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @match        https://tw.myrenta.com/item/*
// @include      /^https://afdian.com/album/([0-9a-z]+)/([0-9a-z]+)$/
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://update.greasyfork.org/scripts/442002/1541573/coofoUtils.js
// @require      https://greasyfork.org/scripts/453330-coofoutils-tampermonkeyutils/code/coofoUtils-tampermonkeyUtils.js?version=1106599
// @require      https://update.greasyfork.org/scripts/453329/1340176/coofoUtils-comicInfo.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// ==/UserScript==


(function (tools) {
    'use strict';    //setting
    let setting = tools.setting;

    Object.assign(setting, {
        /**
         * 下载线程数量
         * @type {number}
         */
        threadNum: 8,

        /**
         * 下载失败重试次数
         * @type {number}
         */
        downloadRetryTimes: 2
    });

    let url = window.location.href;


    if (url.match(tools.afdian.regex.detailUrl) != null) {
        //设置下载按钮
        GM_registerMenuCommand("下载", async function () {
            Swal.fire({
                icon: 'warning',
                title: '自动下载中',
                html: `<div id="status"></div>`,
                footer: `请勿关闭该页面`,
                showConfirmButton: false
            });
            let status = $("#status");
            let taskCount = coofoUtils.service.taskCount.create();
            taskCount.setStatusCallback(({size, finished}) => {
                let digitNum;
                if (size > 1000) {
                    digitNum = 2;
                } else if (size > 100) {
                    digitNum = 1;
                } else {
                    digitNum = 0;
                }
                let percent = coofoUtils.commonUtils.format.num.toThousands(finished / size * 100, null, digitNum) + "%";
                status.html(finished + '/' + size + " " + percent);
            });
            let url = window.location.href;
            let urlMatch = url.match(tools.afdian.regex.detailUrl);
            let albumId = urlMatch[1];
            let postId = urlMatch[2];
            let {pics: imgUrlList, title: title} = await tools.afdian.promise.getImgUrl(postId, albumId);
            let threadPool = coofoUtils.service.threadPoolTaskExecutor.create(setting.threadNum);
            let imgList = await Promise.all(imgUrlList.map(imgUrl => threadPool.execute(taskCount.addTask((resolve, reject) => {
                tools.afdian.downloadHelp.downloadImg(imgUrl)
                    .then(resolve, reject);
            }))));
            let zip = new JSZip();
            for (let i = 0; i < imgList.length; i++) {
                let info = imgList[i];
                let num = coofoUtils.commonUtils.format.num.fullNum((i + 1), 3);
                zip.file(num + info.fileType, info.data);
            }
            let zipFile = await zip.generateAsync({type: "blob", compression: "STORE"});
            coofoUtils.commonUtils.downloadHelp.toUser.asHref4Blob(zipFile, title + ".zip");
            Swal.fire({
                title: "下载完成",
                icon: "success"
            });
        });
    }

})((function () {
    const constants = {};
    const cache = {};
    const tools = {
        setting: {},
        afdian: {
            regex: {
                detailUrl: new RegExp("^https://afdian.com/album/([0-9a-z]+)/([0-9a-z]+)$"),
            },
            promise: {
                getImgUrl: function (postId, albumId) {
                    return new Promise(resolve => {
                        tools.afdian.api.getImgUrl(postId, albumId, urlList => resolve(urlList))
                    });
                }
            },
            api: {
                getImgUrl(postId, albumId, onSuccess, onError, onComplete) {
                    let date = {
                        post_id: postId,
                        album_id: albumId
                    };
                    console.log(date);
                    $.ajax({
                        url: "/api/post/get-detail",
                        data: date,
                        type: 'get',
                        dataType: 'json',
                        contentType: "application/json; charset=UTF-8",
                        success: function (request) {
                            let pics = request.data.post.pics;
                            console.log(pics);
                            onSuccess({pics: pics, title: request.data.post.title});
                        },
                        error: onError,
                        complete: onComplete
                    });
                }
            },
            downloadHelp: {
                downloadImg: function (url) {
                    return window.coofoUtils.service.retryablePromise.create((res, rej) => {
                        let request = new XMLHttpRequest;
                        console.log("start", url);
                        request.open("GET", url, !0);
                        request.responseType = "arraybuffer";
                        request.onload = function () {
                            if (200 === request.status) {
                                console.log("success", url);
                                let info = {
                                    data: request.response,
                                    fileType: url.substr(url.lastIndexOf('.'))
                                };
                                res(info);
                            } else {
                                rej();
                            }
                        };
                        request.onerror = () => {
                            rej();
                        };
                        request.send();
                    }, tools.setting.downloadRetryTimes);
                }
            }
        }
    };
    return tools;
})());