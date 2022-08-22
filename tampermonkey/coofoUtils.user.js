// ==UserScript==
// @name         coofoUtils
// @namespace    https://github.com/coofo/someScript
// @version      0.0.15
// @license      MIT License
// @description  一些工具
// @author       coofo
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/coofoUtils.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function () {
    'use strict';
    window.coofoUtils = {
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
                    },
                    percentAutoDigitNum: function (num, total, maxDigitNum) {
                        let standard = 100;
                        let digitNum = 0;
                        while (standard > total && maxDigitNum < digitNum) {
                            standard *= 10;
                            digitNum++;
                        }
                        return this.toThousands(num / total * 100, null, digitNum) + "%";
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
                    byMap: function (str, map, preprocessing) {
                        let reg = new RegExp('\\${([a-z][a-zA-Z0-9_.]+)}', 'g');
                        return str.replace(reg, function (match, pos, originalText) {
                            let key = match.replace(reg, '$1');
                            let value = map[key];
                            if (value === null || value === undefined) {
                                value = match;
                            }
                            if (typeof preprocessing === "function") {
                                value = preprocessing(value, key, map);
                            }
                            return value;
                        });
                    },
                    filePathByMap: function (str, map) {
                        let preprocessing = function (value, key, map) {
                            let match = key.match(/^(.*)_([a-zA-Z0-9]+)$/);
                            let ext = null;
                            if (match != null) {
                                let rKey = match[1];
                                ext = match[2];
                                let rValue = map[rKey];
                                if (rValue !== null && rValue !== undefined) {
                                    value = rValue;
                                } else {
                                    value = "";
                                }
                            }

                            if (typeof value === "string") {
                                value = value.replace(/[\/:?"<>*|~]/g, function (match, pos, originalText) {
                                    switch (match) {
                                        case "\\":
                                            return "＼";
                                        case "/":
                                            return "／";
                                        case ":":
                                            return "：";
                                        case "?":
                                            return "？";
                                        case '"':
                                            return '＂';
                                        case '<':
                                            return '＜';
                                        case '>':
                                            return '＞';
                                        case '*':
                                            return '＊';
                                        case '|':
                                            return '｜';
                                        case '~':
                                            return '～';
                                    }
                                });
                            }

                            if (ext !== null && value !== "") {
                                switch (ext) {
                                    case "empty":
                                        break;
                                    case "path":
                                        value += '/';
                                        break;
                                    case "parenthesis":
                                        value = "(" + value + ")";
                                        break;
                                    case "squareBracket":
                                        value = "[" + value + "]";
                                        break;
                                    case "curlyBracket":
                                        value = "{" + value + "}";
                                        break;
                                    default:
                                        let indexMatch = ext.match(/index([0-9]+)/);
                                        if (indexMatch !== null && (typeof value === "number" || ('' + value).match(/^\d+$/))) {
                                            value = coofoUtils.commonUtils.format.num.fullNum(value, Number(indexMatch[1]));
                                        }
                                        break;
                                }
                            }

                            return value;
                        };
                        return coofoUtils.commonUtils.format.string.byMap(str, map, preprocessing);
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
                toBlob: {},
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
                    }
                }
            },
            xss: {
                htmlEscape: function (text) {
                    if (!text) {
                        return text;
                    }
                    text = text + "";
                    return text.replace(/[<>"&']/g, function (match, pos, originalText) {
                        switch (match) {
                            case "<":
                                return "&lt;";
                            case ">":
                                return "&gt;";
                            case "&":
                                return "&amp;";
                            case "\"":
                                return "&quot;";
                            case "'":
                                return "&#39;";
                        }
                    })
                }
            }
        },
        comicInfoUtils: {
            create: function (info) {
                let p = ['Series', 'Title', 'Number', 'Count', 'Volume', 'Summary', 'Notes', 'Year', 'Month', 'Day',
                    'Writer', 'Penciller', 'Inker', 'Colorist', 'Letterer', 'CoverArtist', 'Editor', 'Translator',
                    'Publisher', 'Imprint', 'Genre', 'Tags', 'Web', 'Format', 'BlackAndWhite', 'Manga', 'Characters',
                    'Teams', 'Locations', 'ScanInformation', 'StoryArc', 'StoryArcNumber', 'SeriesGroup', 'AgeRating',
                    'CommunityRating', 'PageCount', 'LanguageISO'];
                let xml = "<?xml version='1.0' encoding='utf-8'?>\n";
                xml += '<ComicInfo>\n';

                for (let i = 0; i < p.length; i++) {
                    let name = p[i];
                    let value = info[name];
                    if (value !== undefined && value !== null && value.length > 0) {
                        if (typeof value === 'object') {
                            value = value.join(',');
                        }
                        xml += `  <${name}>${coofoUtils.commonUtils.xss.htmlEscape(value)}</${name}>\n`;
                    }
                }

                xml += '</ComicInfo>';
                return xml;
            }
        },
        tampermonkeyUtils: {
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
            }
        },
        service: {
            task: {
                create: function (callBack) {
                    let task = {
                        runtime: {taskList: [], callBack: callBack, callBackDone: false},
                        api: {
                            getRuntime: function () {
                                return this.runtime;
                            },
                            addTask: function (exec, taskInfo, lastRetryTimes) {
                                let taskItem = {
                                    taskInfo: taskInfo,
                                    handler: null,
                                    complete: false,
                                    lastFinishTime: 0,
                                    lastRetryTimes: lastRetryTimes + 1,
                                    exec: function (onTaskFinish) {
                                        this.onTaskFinish = onTaskFinish;
                                        exec(this.taskInfo, this);
                                    },
                                    success: function () {
                                        this.handler = null;
                                        this.complete = true;
                                        this.lastFinishTime = Date.now();
                                        this.onTaskFinish();

                                    },
                                    failed: function () {
                                        this.handler = null;
                                        this.lastRetryTimes--;
                                        this.lastFinishTime = Date.now();
                                        this.onTaskFinish();
                                    },
                                    onTaskFinish: null
                                };
                                task.runtime.taskList.push(taskItem);
                            },
                            exec: function (handler) {
                                let taskList = task.runtime.taskList;
                                //判断该执行器是否有未完任务，并指定为失败
                                // for (let i = 0; i < taskList.length; i++) {
                                //     let taskItem = taskList[i];
                                //     if (taskItem.handler === handler) {
                                //         taskItem.failed();
                                //     }
                                // }

                                //寻找新任务并标记返回
                                let allFinished = true;
                                let completeNum = 0;
                                let retryTimesOutNum = 0;
                                for (let i = 0; i < taskList.length; i++) {
                                    let taskItem = taskList[i];

                                    if (taskItem.complete === true) {
                                        completeNum++;
                                    } else if (taskItem.lastRetryTimes > 0) {
                                        if (taskItem.handler == null) {
                                            taskItem.handler = handler;
                                            setTimeout(function () {
                                                taskItem.exec(function () {
                                                    task.api.exec(handler);
                                                });
                                            }, 0);
                                            return;
                                        } else {
                                            allFinished = false;
                                        }
                                    } else {
                                        retryTimesOutNum++;
                                    }
                                }
                                if (allFinished && !task.runtime.callBackDone) {
                                    task.runtime.callBackDone = true;
                                    setTimeout(function () {
                                        if (typeof task.runtime.callBack === 'function') {
                                            task.runtime.callBack(completeNum, retryTimesOutNum);
                                        }
                                    }, 0);
                                }
                            },
                        }
                    };
                    return task;
                }
            }
        }
    };
})();