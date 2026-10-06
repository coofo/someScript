// ==UserScript==
// @name         x图片下载自动触发
// @namespace    https://github.com/coofo/someScript
// @version      0.0.2
// @license      AGPL License
// @description  下载
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/x.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/x.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @match        https://x.com/*
// @require      https://update.greasyfork.org/scripts/442002/1153835/coofoUtils.js
// @require      https://update.greasyfork.org/scripts/453329/1340176/coofoUtils-comicInfo.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==


(function () {
    'use strict';    //setting
    let setting = {
        def: {
            time: 1000
        }
    };

    let status = "wait";

    let urlRegex = new RegExp("^https://x\\.com/([^/]+)/media(\\?.*)?$")

    //设置按钮
    GM_registerMenuCommand("停止", function () {
        status = "stop";
    });
    GM_registerMenuCommand("自动下载", function () {
        status = "running";
        if (!urlRegex.test(window.location.href)) {
            alert("请打开用户媒体页面");
            return;
        }
        let templateSetting = Object.assign({}, setting.def, GM_getValue("setting", {}));
        let nowScrollTop = -1;
        let autoDownload = function () {
            if (status === "stop") {
                alert("已停止");
                return;
            }
            let list = document.querySelectorAll("div.tmd-media.download");
            let scrollTop = document.documentElement.scrollTop;
            if (list.length <= 0 && nowScrollTop === scrollTop) {
                alert("结束")
                return;
            }
            nowScrollTop = scrollTop;
            for (let i = 0; i < list.length; i++) {
                let div = list[i];
                setTimeout(() => div.click(), templateSetting.time * i);
            }
            window.scroll({top: scrollTop + 800, behavior: 'smooth'});
            setTimeout(() => autoDownload(), (templateSetting.time * list.length) + 1000)
        }
        autoDownload();
    });
    GM_registerMenuCommand("生成 ComicInfo.xml", function () {

        if (!urlRegex.test(window.location.href)) {
            alert("请打开用户媒体页面");
            return;
        }
        let nameId = document.querySelectorAll("div[data-testid=UserName]")[0].textContent;
        let index = nameId.lastIndexOf("@");

        let info = {
            userName: nameId.substring(0, index),
            id: nameId.substring(index + 1),
        };
        console.log(info);

        let tagStr = prompt("请输入标签,用英文逗号隔开");

        let xmlInfo = {
            Series: "X " + info.id,
            Writer: [info.userName, info.id],
            Publisher: ['X'],
            Tags: tagStr.split(","),
            Web: window.location.href,
        };

        let xml = coofoUtils.comicInfoUtils.create(xmlInfo);
        coofoUtils.commonUtils.downloadHelp.toUser.asTagA4Blob(xml, 'ComicInfo.xml');
    })


})();