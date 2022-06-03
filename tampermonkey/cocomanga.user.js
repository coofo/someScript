// ==UserScript==
// @name         cocomanga去广告
// @namespace    https://github.com/coofo/someScript
// @version      0.0.1
// @license      AGPL License
// @description  大场镇预约超市
// @author       coofo
// @updateURL    https://github.com/coofo/someScript/raw/main/tampermonkey/cocomanga.user.js
// @downloadURL  https://github.com/coofo/someScript/raw/main/tampermonkey/cocomanga.user.js
// @supportURL   https://github.com/coofo/someScript/issues
// @match        https://www.cocomanga.com/*
// @require      https://greasyfork.org/scripts/442002-coofoutils/code/coofoUtils.js?version=1047387
// ==/UserScript==

(function () {
    'use strict';

    // $('#HMcoupletDivright').remove();
    // $('#HMcoupletDivleft').remove();
    //
    // let num = 0;
    // let keys = ['#HMRichBox', '#wrap-fixed', "div:has(a.hmcakes112):not(.fed-part-case,.fed-main-info)"];
    //
    // function clear() {
    //     for (let i = 0; i < keys.length; i++) {
    //         let key = keys[i];
    //         let selector = $(key);
    //         if (selector.length > 0) {
    //             num++;
    //             selector.remove();
    //         }
    //     }
    //     if (num < keys.length) {
    //         setTimeout(clear, 100);
    //     } else {
    //         // alert("f")
    //     }
    // }
    //
    // clear();
    //

    function clear1(times) {
        $('#HMRichBox').remove();
        $('#wrap-fixed').remove();
        $('#HMcoupletDivright').remove();
        $('#HMcoupletDivleft').remove();
        $("div:has(a.hmcakes112):not(.fed-part-case,.fed-main-info)").remove();

        if (times > 0) {
            times--;
            setTimeout(() => clear1(times), 1000 / (times + 1));
        }
    }

    clear1(10);

    // setTimeout(() => {
    //     $('#HMRichBox').remove();
    //     $('#wrap-fixed').remove();
    //     $('#HMcoupletDivright').remove();
    //     $('#HMcoupletDivleft').remove();
    //     $("div:has(a.hmcakes112):not(.fed-part-case,.fed-main-info)").remove();
    // }, 500);

}());