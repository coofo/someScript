// ==UserScript==
// @name         myrenta图片下载
// @namespace    https://github.com/coofo/someScript
// @version      0.0.14
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/myrenta.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @match        https://tw.myrenta.com/item/*
// @include      /^https://reader.myrenta.com/viewer/sc/viewer_aws/[0-9a-z]+/[\d-]+/type_(6|10)/index.html(\?.*)?$/
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1084326
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


    setting.def={};
    /**
     * 文件名格式（包括路径）
     * ${itemId}       漫画ID
     * ${title}        漫画名
     * ${index}        插图序号
     */
    setting.def.fileNameTemplate = "[myrenta]/${bookId_squareBracket}${author_squareBracket}${bookName_path}${itemId_squareBracket}${title}/${index_index4}";

    /**
     * zip文件名格式（包括路径）
     */
    setting.def.zipNameTemplate = "[myrenta]${itemId_squareBracket}${originalTitle}";


    //设置按钮
    GM_registerMenuCommand("文件名设置", function () {
        let html = `文件名格式<br/>
                        <input id="fileNameTemplate" style="width: 90%;"><br/>
                        压缩包名格式<br/>
                        <input id="zipNameTemplate" style="width: 90%;"><br/>
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
                    fileNameTemplate: $('#fileNameTemplate').val(),
                    zipNameTemplate: $('#zipNameTemplate').val()
                };
                GM_setValue("templateSetting", templateSetting);
            } else if (result.isDenied) {
                GM_deleteValue("templateSetting");
            }
        });
        let templateSetting = GM_getValue("templateSetting", {
            fileNameTemplate: setting.def.fileNameTemplate,
            zipNameTemplate: setting.def.zipNameTemplate
        });
        $('#fileNameTemplate').val(templateSetting.fileNameTemplate);
        $('#zipNameTemplate').val(templateSetting.zipNameTemplate);
        // $('#saveTemplate').click(function () {
        //     let templateSetting = {
        //         fileNameTemplate: $('#fileNameTemplate').val(),
        //         zipNameTemplate: $('#zipNameTemplate').val()
        //     };
        //     GM_setValue("templateSetting", templateSetting);
        // });
        // $('#resetTemplate').click(function () {
        //     $('#fileNameTemplate').val(setting.def.fileNameTemplate);
        //     $('#zipNameTemplate').val(setting.def.zipNameTemplate);
        // });

    });


    let urlMatch = null;
    if ((urlMatch = url.match(tools.myrenta.regex.bookUrl)) != null) {
        $('#addMyList').after('<a id="saveBookInfo" href="javascript:;" class="btn btn-collect">暂存信息</a>');

        $('#saveBookInfo').click(function () {
            // console.log(GM_getValue("bookInfo",{}));
            let publisher = $('div.info-main>ul>li:contains(發行)>div.text>a>h2').toArray().map(o=>$(o).html());
            publisher.push('myrenta');
            // let summary = {};
            // $(".other-vols").toArray().forEach(o => summary[$(o).find("h4").text().trim()] = $(o).find(".intro-text p").text().trim());
            let info = {
                bookId: urlMatch[1],
                bookName: $('div.main>div.breadcrumbs>a:last').html(),
                author: $('div.info-main>ul>li:contains(作者)>div.text>a>h2').html(),
                publisher: publisher,
                tag: $('.btn-tag').toArray().map(o=>$(o).html()),
                // summary: summary,
                summarys: $(".other-vols").toArray().map(o => {
                    return {title: $(o).find("h4").text().trim(), summary: $(o).find(".intro-text p").text().trim()}
                })
            };
            GM_setValue("bookInfo", info);
            let htmlEscape = coofoUtils.commonUtils.xss.htmlEscape;
            let html = '';
            for (let n in info) {
                html += n + '：' + htmlEscape(info[n]) + '<br>';
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

    } else if ((urlMatch = url.match(tools.myrenta.regex.bookDetailUrl)) != null) {

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

        let download = function (bookInfo) {
            if (tools.runtime.nowDownloading) return;
            tools.runtime.nowDownloading = true;

            tools.runtime.downloadTask.zip = new JSZip();

            let generateTask = coofoUtils.service.task.create();
            let downloadTask = coofoUtils.service.task.create();
            tools.runtime.downloadTask.generateTask = generateTask;
            tools.runtime.downloadTask.downloadTask = downloadTask;

            let originalTitle = $("p.title span").html();
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
            let baseInfo = Object.assign({
                originalTitle: originalTitle,
                title: title,
                itemId: urlMatch[3]
            }, bookInfo);

            //ComicInfo.xml
            let fileName = tools.myrenta.downloadHelp.fileNameService.getFileName(Object.assign({
                index: "ComicInfo",
                suffix: ".xml"
            }, baseInfo));
            let summary = '';
            baseInfo.summarys.forEach(o=>{
                if (o.title.startsWith(originalTitle)) {
                    summary = o.summary;
                }
            });
            let xml = coofoUtils.comicInfoUtils.create({
                Series: baseInfo.bookName,
                Title: baseInfo.title,
                // Number: Number(infoEx.idx) + 1 + '',
                Summary: summary,
                Writer: baseInfo.author,
                Publisher: baseInfo.publisher.join(','),
                Tags: baseInfo.tag.join(','),
                LanguageISO:'zh'
            });
            tools.runtime.downloadTask.zip.file(fileName, xml);

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

        };


        // let setting4Download = function (info) {
        //     let html = `文件名格式<br/>
        //                 <input id="fileNameTemplate" style="width: 90%;"><br/>
        //                 压缩包名格式<br/>
        //                 <input id="zipNameTemplate" style="width: 90%;"><br/>
        //                 <button id="saveTemplate">保存</button><button id="resetTemplate">默认值</button>`;
        //     Swal.fire({
        //         title: '命名模板设置',
        //         html: html,
        //         footer: `<div><table border="1">
        //                      <tr><td>巨集</td><td>说明</td></tr>
        //                      <tr><td>\${bookId}</td><td>作品集合ID（暂存信息后才可获取）</td></tr>
        //                      <tr><td>\${bookName}</td><td>作品名称（暂存信息后才可获取）</td></tr>
        //                      <tr><td>\${author}</td><td>作者（暂存信息后才可获取）</td></tr>
        //                      <tr><td>\${itemId}</td><td>册ID</td></tr>
        //                      <tr><td>\${originalTitle}</td><td>完整册标题名</td></tr>
        //                      <tr><td>\${title}</td><td>册标题名</td></tr>
        //                      <tr><td>\${index}</td><td>图序号</td></tr>
        //                   </table><br>
        //                   <table border="1">
        //                      <tr><td>后缀</td><td>说明（取到值时才生效，取不到则替换为空字符串）</td></tr>
        //                      <tr><td>empty</td><td>未取到时填充为空字符串</td></tr>
        //                      <tr><td>parenthesis</td><td>圆括号</td></tr>
        //                      <tr><td>squareBracket</td><td>方括号</td></tr>
        //                      <tr><td>curlyBracket</td><td>大括号</td></tr>
        //                      <tr><td>path</td><td>后加文件夹分隔符</td></tr>
        //                      <tr><td>index2</td><td>向前添0补全至2位</td></tr>
        //                      <tr><td>index3</td><td>向前添0补全至3位（以此类推）</td></tr>
        //                  </table></div>`
        //     }).then((result) => {
        //         if (result.isConfirmed) {
        //             setting.fileNameTemplate = $('#fileNameTemplate').val();
        //             setting.zipNameTemplate = $('#zipNameTemplate').val();
        //             download(info);
        //         }
        //     });
        //     let templateSetting = GM_getValue("templateSetting", null);
        //     if (templateSetting == null) {
        //         $('#fileNameTemplate').val(setting.def.fileNameTemplate);
        //         $('#zipNameTemplate').val(setting.def.zipNameTemplate);
        //     } else {
        //         $('#fileNameTemplate').val(templateSetting.fileNameTemplate);
        //         $('#zipNameTemplate').val(templateSetting.zipNameTemplate);
        //     }
        //     $('#saveTemplate').click(function () {
        //         let templateSetting = {
        //             fileNameTemplate: $('#fileNameTemplate').val(),
        //             zipNameTemplate: $('#zipNameTemplate').val()
        //         };
        //         GM_setValue("templateSetting", templateSetting);
        //     });
        //     $('#resetTemplate').click(function () {
        //         $('#fileNameTemplate').val(setting.def.fileNameTemplate);
        //         $('#zipNameTemplate').val(setting.def.zipNameTemplate);
        //         GM_deleteValue("templateSetting");
        //     });
        //
        // };

        btn.click(function () {

            let templateSetting = GM_getValue("templateSetting", {
                fileNameTemplate: setting.def.fileNameTemplate,
                zipNameTemplate: setting.def.zipNameTemplate
            });
            setting.fileNameTemplate = templateSetting.fileNameTemplate;
            setting.zipNameTemplate = templateSetting.zipNameTemplate;

            let info = GM_getValue("bookInfo", {});
            let html = '';
            let infoNum = 0;
            let htmlEscape = coofoUtils.commonUtils.xss.htmlEscape;
            for (let n in info) {
                if (!info.hasOwnProperty(n)) continue;
                html += n + '：' + htmlEscape(info[n]) + '<br>';
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
                        // setting4Download(info);
                        download(info);
                    } else if (result.isDenied) {
                        // setting4Download({});
                        download({});
                    }
                });

            } else {
                // setting4Download({});
                download({});
            }
        });
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
                bookDetailUrl: new RegExp("^https://reader.myrenta.com/viewer/sc/viewer_aws/([0-9a-z]+)/([0-9]+-([0-9]+)-[0-9]+)/type_(6|10)/index.html(\\?.*)?$"),
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