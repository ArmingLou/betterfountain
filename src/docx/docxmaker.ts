// TODO: Extract docxmaker to a separate library (+++++)

import * as fountainconfig from "../configloader";
import * as print from "../pdf/print";
import * as path from 'path';
import * as vscode from 'vscode';
import helpers from "../helpers";
import { cleanStlyleChars, isBlankLineAfterStlyle, wordToColor } from "../utils";
// import { cleanStlyleChars } from "../utils";
import * as he from 'he';
// import { addTextbox, drawTextLinesOnDocx, measureTextWidth } from 'textbox-for-docxkit';
import { regex } from "../afterwriting-parser";
import { charOfStyleTag } from "../cons";
import * as fs from "fs";
import * as Docx from "docx";

// import * as blobUtil from "blob-util";
export class Options {
    line_height: number;
    filepath: string;
    config: fountainconfig.FountainConfig;
    parsed: any;
    print: print.PrintProfile;
    font: string;
    exportconfig: fountainconfig.ExportConfig;
    font_italic: string;
    font_bold: string;
    font_bold_italic: string;
    stash_style_right_clumn: StyleStash;
    stash_style_left_clumn: StyleStash;
    stash_style_global_clumn: StyleStash;
    italic_global: boolean;
    italic_dynamic: boolean;
    found_font_italic: boolean;
    found_font_bold: boolean;
    found_font_bold_italic: boolean;
    metadata: any;
    for_preview: boolean;
}

export class StyleStash {
    bold_italic: boolean;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    override_color: string;
    italic_global: boolean;
    italic_dynamic: boolean;
}

// var DocxDocument = require('docxkit'),
//helper = require('../helpers'),
//  var Blob = require('blob');

// const textbox_width_error = 0;


async function initDoc(opts: Options) {
    var embedFonts = false;
    var print = opts.print;
    var fontsNames = new Map<string, string>();
    fontsNames.set('normal', 'Courier Prime');
    // fontsNames.set('bold', 'Courier Prime');
    // fontsNames.set('bold_italic', 'Courier Prime');
    // fontsNames.set('italic', 'Courier Prime');
    if (opts.font != "Courier Prime" && opts.font !== '') {
        fontsNames.set('normal', opts.font);
        // fontsNames.set('bold', opts.font);
        // fontsNames.set('bold_italic', opts.font);
        // fontsNames.set('italic', opts.font);
    }
    if (opts.font_italic !== '') {
        fontsNames.set('italic', opts.font_italic);
        fontsNames.set('bold_italic', opts.font_italic);
    }
    if (opts.font_bold !== '') {
        fontsNames.set('bold', opts.font_bold);
    }
    if (opts.font_bold_italic !== '') {
        fontsNames.set('bold_italic', opts.font_bold_italic);
    }


    if (!opts.for_preview) {
        if (opts.metadata) {
            if (opts.metadata.embedFonts) {
                embedFonts = true;
            }
        }
    }


    var options: any = {
        creator: "Arming",
        description: "My screenplay document",
        title: "My Screenplay",
    };


    var fontMap = new Map<string, any>();
    /* if (opts.config.fonts) {
         doc.registerFont('ScriptNormal', fonts.normal.src, fonts.normal.family);
         doc.registerFont('ScriptBold', fonts.bold.src, fonts.bold.family);
         doc.registerFont('ScriptBoldOblique', fonts.bolditalic.src, fonts.bolditalic.family);
         doc.registerFont('ScriptOblique', fonts.italic.src, fonts.italic.family);
     }
     else {*/
    const fontFinder = require('font-finder');
    //Load Courier Prime by default, and replace the variants if requested and available
    opts.found_font_bold = false;
    opts.found_font_italic = false;
    opts.found_font_bold_italic = false;

    if (opts.font == "Courier Prime" || !opts.font) {
        // opts.found_font_bold = true;
        // opts.found_font_italic = true;
        // opts.found_font_bold_italic = true;
        var fp = __dirname.slice(0, __dirname.lastIndexOf(path.sep)) + path.sep + 'courierprime' + path.sep
        fontMap.set('ScriptNormal', { name: "Courier Prime", data: fs.readFileSync(fp + 'courier-prime.ttf'), characterSet: "00" });
        fontMap.set('ScriptBold', { name: "Courier Prime", data: fs.readFileSync(fp + 'courier-prime-bold.ttf'), characterSet: "00" });
        fontMap.set('ScriptBoldOblique', { name: "Courier Prime", data: fs.readFileSync(fp + 'courier-prime-bold-italic.ttf'), characterSet: "00" });
        fontMap.set('ScriptOblique', { name: "Courier Prime", data: fs.readFileSync(fp + 'courier-prime-italic.ttf'), characterSet: "00" });
    } else {
        var variants = await fontFinder.listVariants(opts.font);
        variants.forEach((variant: any) => {
            fontMap.set(variant.path, { name: opts.font, data: fs.readFileSync(variant.path), characterSet: "00" });
        });
    }

    if (opts.font_italic !== '') {
        opts.found_font_italic = false;
        var variants = await fontFinder.listVariants(opts.font_italic);
        var pat = '';
        var patDf = '';
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "italic":
                    // doc.registerFont('ScriptOblique', variant.path);
                    fontMap.set(variant.path, { name: opts.font_italic, data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!opts.found_font_italic) {
            if (pat !== "") {
                fontMap.set(pat, { name: opts.font_italic, data: fs.readFileSync(pat), characterSet: "00" });
                opts.found_font_italic = true;
            }
        }
        if (!opts.found_font_italic) {
            if (patDf !== "") {
                fontMap.set(patDf, { name: opts.font_italic, data: fs.readFileSync(patDf), characterSet: "00" });
                opts.found_font_italic = true;
            }
        }
    }
    if (opts.font_bold !== '') {
        opts.found_font_bold = false;
        var variants = await fontFinder.listVariants(opts.font_bold);
        var pat = '';
        var patDf = '';
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "bold":
                    // doc.registerFont('ScriptOblique', variant.path);
                    fontMap.set(variant.path, { name: opts.font_bold, data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_bold = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!opts.found_font_bold) {
            if (pat !== "") {
                fontMap.set(pat, { name: opts.font_bold, data: fs.readFileSync(pat), characterSet: "00" });
                opts.found_font_bold = true;
            }
        }
        if (!opts.found_font_bold) {
            if (patDf !== "") {
                fontMap.set(patDf, { name: opts.font_bold, data: fs.readFileSync(patDf), characterSet: "00" });
                opts.found_font_bold = true;
            }
        }
    }
    if (opts.font_bold_italic !== '') {
        opts.found_font_bold_italic = false;
        var variants = await fontFinder.listVariants(opts.font_bold_italic);
        var pat = '';
        var patDf = '';
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "boldItalic":
                    // doc.registerFont('ScriptOblique', variant.path);
                    fontMap.set(variant.path, { name: opts.font_bold_italic, data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_bold_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!opts.found_font_bold_italic) {
            if (pat !== "") {
                fontMap.set(pat, { name: opts.font_bold_italic, data: fs.readFileSync(pat), characterSet: "00" });
                opts.found_font_bold_italic = true;
            }
        }
        if (!opts.found_font_bold_italic) {
            if (patDf !== "") {
                fontMap.set(patDf, { name: opts.font_bold_italic, data: fs.readFileSync(patDf), characterSet: "00" });
                opts.found_font_bold_italic = true;
            }
        }
    }

    // doc.font('ScriptNormal');
    // doc.fontSize(print.font_size || 12);
    if (embedFonts) {
        var fontsArr = Array.from(fontMap.values());

        options = {
            ...options,
            fonts: fontsArr,
        };
    }


    var doc: any = { options: options, fontNames: fontsNames };

    doc.chinaFormat = 0;
    if (opts.metadata) {
        if (opts.metadata.chinaFormat) {
            doc.chinaFormat = opts.metadata.chinaFormat;
        }
    }


    doc.runBold = {
        font: opts.found_font_bold ? doc.fontNames.get("bold") : doc.fontNames.get("normal"),
        bold: !opts.found_font_bold,
    }

    doc.runItalic = {
        font: opts.found_font_italic ? doc.fontNames.get("italic") : doc.fontNames.get("normal"),
        italic: !opts.found_font_italic,
    }

    doc.runBoldItalic = {
        font: opts.found_font_bold_italic ? doc.fontNames.get("bold_italic") : (opts.found_font_italic ? doc.fontNames.get("italic") : doc.fontNames.get("normal")),
        bold: opts.found_font_bold_italic ? false : true,
        italic: opts.found_font_bold_italic ? false : opts.found_font_italic ? false : true,
    }

    doc.runNormal = {
        font: doc.fontNames.get('normal'),
        blod: false,
        italic: false,
    }

    var fontSize_ = print.note_font_size || 9
    fontSize_ = fontSize_ * 2 // docx bug ？ must double
    doc.runNotes = {
        color: print.note.color,
        font: doc.fontNames.get('normal'),
        size: fontSize_,
        characterSpacing: 0,
    }


    // convert points to inches for text
    doc.reset_format = function () {
        doc.format_state = {
            bold_italic: false,
            bold: false,
            italic: false,
            underline: false,
            override_color: null
        };
        opts.italic_global = false;
        opts.italic_dynamic = false;
    };
    doc.reset_format();
    // doc.format_state = {
    //     bold_italic: false,
    //     bold: false,
    //     italic: false,
    //     underline: false,
    //     override_color: null
    // };

    doc.global_stash = function () {
        opts.stash_style_global_clumn = {
            bold_italic: doc.format_state.bold_italic,
            bold: doc.format_state.bold,
            italic: doc.format_state.italic,
            underline: doc.format_state.underline,
            override_color: doc.format_state.override_color,
            italic_global: opts.italic_global,
            italic_dynamic: opts.italic_dynamic,
        }
        doc.reset_format();
    };
    doc.global_pop = function () {
        doc.format_state.bold_italic = opts.stash_style_global_clumn.bold_italic;
        doc.format_state.bold = opts.stash_style_global_clumn.bold;
        doc.format_state.italic = opts.stash_style_global_clumn.italic;
        doc.format_state.underline = opts.stash_style_global_clumn.underline;
        doc.format_state.override_color = opts.stash_style_global_clumn.override_color;
        opts.italic_global = opts.stash_style_global_clumn.italic_global;
        opts.italic_dynamic = opts.stash_style_global_clumn.italic_dynamic;
    };

    //var inner_text = doc.text;
    // doc.simple_text = function () {
    //     doc.font('ScriptNormal');
    //     doc.text.apply(doc, arguments);
    // };
    // 缓存doc样式画了后，再恢复之前的样式
    doc.format_text = function (text: string, options: any) {
        doc.global_stash();
        var res = doc.text2(text, options);
        doc.global_pop();
        return res
    };

    doc.currentNote = {
        pageIdx: -1,
        note: [] as any[]
    }

    // doc.fillColor = options.color || '#000000';
    // doc.fill = function (color: string) {
    //     doc.fillColor = color;
    // }

    doc.notesLen = 0;
    doc.text2 = function (text: string, options: any, currentLineNotes?: any, notesPage?: any): Docx.Run[] {
        options = options || {};
        var color = options.color || '#000000';
        color = doc.format_state.override_color ? doc.format_state.override_color : color;

        // doc.fill(color);

        var catchNotes = false;
        if (currentLineNotes && notesPage) {
            catchNotes = true; // 页面底部notes打印模式
            if (doc.currentNote.pageIdx >= 0) {
                // 如果正在处理notes，并且收集到底部，本行为notes开始内容
                if (doc.chinaFormat === 1 && text.startsWith('△')) {
                    text = text.substring(1);
                    doc.cacheTriangle = true;
                }
            } else {
                doc.cacheTriangle = false;
            }
        }

        if (doc.chinaFormat === 1 && text.startsWith('△') && doc.forceNoteOrig) {
            text = text.substring(1);
        }

        // function note_lines() {
        //     var l = 0;
        //     var notes = notesPage;
        //     if (notes) {
        //         // 页
        //         for (let i = 0; i < notes.length; i++) {
        //             // token 行
        //             for (let j = 0; j < notes[i].length; j++) {
        //                 // 每个token有几个note
        //                 for (let k = 0; k < notes[i][j].text.length; k++) {
        //                     // 每个note的行
        //                     l++;
        //                 }
        //             }
        //         }
        //     }
        //     // if(l>0){
        //     //     l +=1;
        //     // }
        //     return l;
        // }

        // if (options.highlight) {
        //     doc.highlight(x * 72, (y * 72),
        //         measureTextWidth(cleanStlyleChars(text), 'ScriptNormal', print.font_size || 12, doc),
        //         doc.currentLineHeight(), { color: options.highlightcolor });
        // }

        if (print.note.italic) {
            // text = text.replace(/↺/g, '*↺').replace(/↻/g, '↻*');
            text = text.
                replace(new RegExp(charOfStyleTag.note_begin_ext, 'g'), charOfStyleTag.italic + charOfStyleTag.note_begin_ext).
                replace(new RegExp(charOfStyleTag.note_begin, 'g'), charOfStyleTag.italic + charOfStyleTag.note_begin).
                replace(new RegExp(charOfStyleTag.note_end, 'g'), charOfStyleTag.note_end + charOfStyleTag.italic);
        }
        var links: { start: number, length: number, url: string }[] = [];
        if (options.links) {
            let match;
            //Clean up all the links, while keeping track of their offset in order to add them back in later.
            while ((match = regex.link.exec(text)) !== null) {
                match.index;
                var trimmed = match[3];
                links.push({
                    start: match.index,
                    length: trimmed.length,
                    url: match[6]
                });
                text = text.slice(0, match.index) + match[3] + text.slice(match.index + match[0].length);
            }
        }
        var split_for_formatting = [];
        //Split the text from the start (or from the previous link) until the current one
        //"This is a link: google.com and this is after"
        // |--------------|----------| - - - - - - - |
        var prevlink = 0;
        for (let i = 0; i < links.length; i++) {
            split_for_formatting.push(text.slice(prevlink, links[i].start));
            split_for_formatting.push(text.slice(links[i].start, links[i].start + links[i].length));
            prevlink = links[i].start + links[i].length;
        }
        //...And then add whatever is left over
        //"This is a link: google.com and this is after"
        // | - - - - - - -| - - - - -|----------------|
        var leftover = text.slice(prevlink, text.length);
        if (leftover) split_for_formatting.push(leftover);

        //Further sub-split for bold, italic, underline, etc...
        for (let i = 0; i < split_for_formatting.length; i++) {
            var innersplit = split_for_formatting[i].split(new RegExp('([' + charOfStyleTag.all + '])', 'g')).filter(function (a) {
                return a;
            });
            split_for_formatting.splice(i, 1, ...innersplit);
            i += innersplit.length - 1;
        }

        // var width = options.width ? options.width : print.page_width;
        // var font_width = print.font_width;
        var textobjects = [];
        var currentIndex = 0;
        // var onlyNoteContent = catchNotes && doc.currentNote.pageIdx > -1;
        var pushed = false;
        // var currentWidth = 0;
        for (var i = 0; i < split_for_formatting.length; i++) {
            var elem = split_for_formatting[i];
            if (elem === charOfStyleTag.style_global_clean) {
                doc.reset_format();
                color = options.color || '#000000';

            } else if (elem === charOfStyleTag.style_global_stash) {
                doc.global_stash();
                color = options.color || '#000000';

            } else if (elem === charOfStyleTag.style_global_pop) {
                doc.global_pop();
            }
            else if (elem === charOfStyleTag.style_left_stash) {
                opts.stash_style_left_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.reset_format();
                color = options.color || '#000000';

            } else if (elem === charOfStyleTag.style_left_pop) {
                doc.format_state.bold_italic = opts.stash_style_left_clumn.bold_italic;
                doc.format_state.bold = opts.stash_style_left_clumn.bold;
                doc.format_state.italic = opts.stash_style_left_clumn.italic;
                doc.format_state.underline = opts.stash_style_left_clumn.underline;
                doc.format_state.override_color = opts.stash_style_left_clumn.override_color;
                opts.italic_global = opts.stash_style_left_clumn.italic_global;
                opts.italic_dynamic = opts.stash_style_left_clumn.italic_dynamic;
            }
            else if (elem === charOfStyleTag.style_right_stash) {
                opts.stash_style_right_clumn = {
                    bold_italic: doc.format_state.bold_italic,
                    bold: doc.format_state.bold,
                    italic: doc.format_state.italic,
                    underline: doc.format_state.underline,
                    override_color: doc.format_state.override_color,
                    italic_global: opts.italic_global,
                    italic_dynamic: opts.italic_dynamic,
                }
                doc.reset_format();
                color = options.color || '#000000';
            } else if (elem === charOfStyleTag.style_right_pop) {
                doc.format_state.bold_italic = opts.stash_style_right_clumn.bold_italic;
                doc.format_state.bold = opts.stash_style_right_clumn.bold;
                doc.format_state.italic = opts.stash_style_right_clumn.italic;
                doc.format_state.underline = opts.stash_style_right_clumn.underline;
                doc.format_state.override_color = opts.stash_style_right_clumn.override_color;
                opts.italic_global = opts.stash_style_right_clumn.italic_global;
                opts.italic_dynamic = opts.stash_style_right_clumn.italic_dynamic;
            } else if (elem === charOfStyleTag.italic_global_begin) {
                opts.italic_dynamic = doc.format_state.italic; //记录 global 前状态， 在 global 期间记录 italic 的切换记数。
                opts.italic_global = true;
                doc.format_state.italic = true; // 强制在整个 global 中保持 italic 样式
            } else if (elem === charOfStyleTag.italic_global_end) {
                doc.format_state.italic = opts.italic_dynamic;
                opts.italic_global = false;
            } else if (elem === charOfStyleTag.bold_italic) {
                // doc.format_state.italic = !doc.format_state.italic;
                if (catchNotes && doc.currentNote.pageIdx > -1) {
                    if (!pushed) {
                        doc.currentNote.note.text.push(elem);
                        pushed = true;
                    } else {
                        doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
                    }
                } else {
                    doc.format_state.bold_italic = !doc.format_state.bold_italic;
                }
            } else if (elem === charOfStyleTag.bold) {
                if (catchNotes && doc.currentNote.pageIdx > -1) {
                    if (!pushed) {
                        doc.currentNote.note.text.push(elem);
                        pushed = true;
                    } else {
                        doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
                    }
                } else {
                    doc.format_state.bold = !doc.format_state.bold;
                }
            } else if (elem === charOfStyleTag.italic) {
                if (catchNotes && doc.currentNote.pageIdx > -1) {
                    if (!pushed) {
                        doc.currentNote.note.text.push(elem);
                        pushed = true;
                    } else {
                        doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
                    }
                } else {
                    if (opts.italic_global) {
                        opts.italic_dynamic = !opts.italic_dynamic;
                    } else {
                        doc.format_state.italic = !doc.format_state.italic;
                    }
                }
            } else if (elem === charOfStyleTag.underline) {
                if (catchNotes && doc.currentNote.pageIdx > -1) {
                    if (!pushed) {
                        doc.currentNote.note.text.push(elem);
                        pushed = true;
                    } else {
                        doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
                    }
                } else {
                    doc.format_state.underline = !doc.format_state.underline;
                }
            } else if (elem === charOfStyleTag.note_end) {
                doc.format_state.override_color = null;
                color = options.color || '#000000';
                if (catchNotes && !doc.forceNoteOrig) {
                    if (currentLineNotes.length > 0) {
                        currentLineNotes[currentLineNotes.length - 1].text = doc.currentNote.note.text;
                        // if (!notesPage[doc.currentNote.pageIdx]) {
                        //  //   notesPage[doc.currentNote.pageIdx] = [];
                        // }
                        // // if (notesPage[doc.currentNote.pageIdx].length === 0) {
                        // // notesPage[doc.currentNote.pageIdx].push([]);// 加一个token行
                        // // }
                        // // notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].push([...doc.currentNote.note]);
                    }
                    // else {
                    //     // 当前行先不放入，
                    // }
                    if (notesPage[doc.currentNote.pageIdx]) {
                        if (notesPage[doc.currentNote.pageIdx].length > 0) {
                            notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1][notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].length - 1].text = doc.currentNote.note.text;
                        }
                    }
                    doc.currentNote.pageIdx = -1;
                }
                doc.forceNoteOrig = false;
            } else if (elem === charOfStyleTag.note_begin_ext) {
                // 强制在原位置打印 note 
                doc.format_state.override_color = (print.note && print.note.color) || '#000000';
                doc.forceNoteOrig = true;
            } else {
                // 特殊标示 note_begin 以及 正常字符，进入。
                if (elem === charOfStyleTag.note_begin) {
                    doc.format_state.override_color = (print.note && print.note.color) || '#000000';
                    if (catchNotes) {
                        doc.notesLen++;
                        // var no = 1;
                        // if (notesPage[pageIdx]) {
                        //     if (notesPage[pageIdx].length > 0) {
                        //         if (notesPage[pageIdx][notesPage[pageIdx].length - 1].length > 0) {
                        //             no = notesPage[pageIdx][notesPage[pageIdx].length - 1][notesPage[pageIdx][notesPage[pageIdx].length - 1].length - 1].no + 1
                        //         }
                        //     }
                        // }

                        doc.currentNote = {
                            pageIdx: 0,
                            note: { no: doc.notesLen, text: [''] },
                        };
                        if (!notesPage[doc.currentNote.pageIdx]) {
                            notesPage[doc.currentNote.pageIdx] = [];
                        }
                        if (currentLineNotes.length === 0) {
                            notesPage[doc.currentNote.pageIdx].push([]);// 加一个token行
                        }
                        notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].push({ no: doc.notesLen, text: [''] });
                        currentLineNotes.push({ no: doc.notesLen, text: [''] });
                        pushed = true;
                    }
                }

                if (elem !== charOfStyleTag.note_begin || catchNotes) {

                    var draw = true;
                    if (elem !== charOfStyleTag.note_begin) {
                        if (catchNotes) {
                            if (doc.currentNote.pageIdx >= 0) {
                                if (!pushed) {
                                    doc.currentNote.note.text.push(elem);
                                    pushed = true;
                                } else {
                                    doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
                                }
                                // if (doc.currentNote.note.text.length === 1) {
                                //     elem = charOfStyleTag.note_begin;//'[' + doc.currentNote.note.no + ']';
                                // } else {
                                elem = ''
                                draw = false;
                                // }
                            } else {
                                // onlyNoteContent = false;
                                if (doc.cacheTriangle) {
                                    elem = '△' + elem;
                                    doc.cacheTriangle = false;
                                }
                            }
                        }
                    } else {
                        if (!catchNotes) {
                            elem = '';
                            draw = false;
                        }
                    }

                    if (draw) {

                        if (elem == charOfStyleTag.note_begin) {
                            textobjects.push(new Docx.FootnoteReferenceRun(doc.notesLen));
                        } else {
                            // let font = doc.fontNames.get('normal');
                            var fontSize = undefined;
                            fontSize = options.fontSize || print.font_size || 12;
                            var spacing2 = options.characterSpacing === undefined ? print.character_spacing : options.characterSpacing;
                            if (doc.format_state.override_color) {
                                // 注释中
                                fontSize = print.note_font_size;
                            }
                            fontSize = fontSize * 2 // docx bug? need double

                            var run = {
                                text: elem,
                                ...doc.runNormal
                            }

                            if (doc.format_state.bold_italic) {
                                run = {
                                    text: elem,
                                    ...doc.runBoldItalic
                                }
                            } else if (doc.format_state.bold || options.bold) {
                                run = {
                                    text: elem,
                                    ...doc.runBold
                                }
                            } else if (doc.format_state.italic) {
                                run = {
                                    text: elem,
                                    ...doc.runItalic
                                }
                            }
                            // if (elem === '\\_' || elem === '\\*') {
                            //     elem = elem.substr(1, 1);
                            // }
                            var linkurl = undefined;
                            for (const link of links) {
                                if (link.start <= currentIndex && currentIndex < link.start + link.length) {
                                    linkurl = link.url;
                                }
                            }
                            var coloer2 = doc.format_state.override_color ? doc.format_state.override_color : color

                            run.color = coloer2
                            run.size = fontSize

                            if (spacing2) {
                                run.characterSpacing = spacing2 * 20
                            }

                            if (linkurl || doc.format_state.underline) {
                                run.underline = {
                                    type: Docx.UnderlineType.SINGLE,
                                }
                            }

                            if (options.highlight) {
                                run.highlight = options.highlightcolor
                            }

                            // var tobj = {
                            //     lineBreak: false,
                            //     text: elem,
                            //     link: linkurl,
                            //     font: font,
                            //     underline: linkurl || doc.format_state.underline,
                            //     color: coloer2,
                            //     strokeColor: coloer2,
                            //     oblique: oblique,
                            //     stroke: stroke,
                            //     fontSize: fontSize,
                            // }

                            var spl = elem.split('\n')

                            var run0 = {
                                ...run
                            }
                            run0.text = spl[0]
                            textobjects.push(new Docx.TextRun(run0));

                            if (spl.length > 1) {
                                for (var ii = 1; ii < spl.length; ii++) {
                                    var runi = {
                                        ...run,
                                        break: 1
                                    }
                                    runi.text = spl[ii]
                                    textobjects.push(new Docx.TextRun(runi));
                                }
                            }

                        }

                    }

                }
            }
            currentIndex += elem.length;
            /*inner_text.call(doc, elem, x * 72, y * 72, {
                underline: doc.format_state.underline,
                lineBreak: options.line_break,
                width: options.width * 72,
                align: options.align
            });*/
        }

        // if (textobjects.length === 0 && onlyNoteContent) {
        //     // return { height: 0, breaks: 0, switches: 0, lines: [] }
        //     return []
        // }

        // var firstBreakHeight = firstBreakHeight * 72;
        // if (catchNotes) {
        //     firstBreakHeight = firstBreakHeight - (note_lines(pageIdx) * line_height * 72);
        // }

        // return addTextbox(textobjects, doc, x * 72, y * 72, width * 72, posTop * 72, firstBreakHeight, breakHeight * 72, switchPageFrom, switchPageTo, onlyGetLines,
        //     { // 组件bug,text显示宽度比实际配置的width值要大
        //         lineHeight: options.lineHeight || line_height * 72,
        //         lineBreak: false,
        //         align: options.align,
        //         baseline: 'bottom',
        //         fontSize: options.fontSize || print.font_size || 12,
        //     });

        return textobjects;

    };

    // function splitBy(text: string, delimiter: string) {
    //     var
    //         delimiterPATTERN = '(' + delimiter + ')',
    //         delimiterRE = new RegExp(delimiterPATTERN, 'g');

    //     return text.split(delimiterRE).reduce(function (chunks, item) {
    //         if (item.match(delimiterRE)) {
    //             chunks.push(item)
    //         } else {
    //             chunks[chunks.length - 1] += item
    //         };
    //         return chunks
    //     }, [])
    // }

    // interface image { path: string }
    // doc.text2withImages = function (text: string, x: number, y: number, options: any) {
    //     let textparts = splitBy(text, regex.link.source);
    //     var parts: { text?: string, image?: image }[] = [];
    //     for (let i = 0; i < textparts.length; i++) {
    //         let match = regex.link.exec(textparts[i]);
    //         if (match.length > 0) {
    //             parts.push({ image: { path: match[6] } });
    //             parts.push({ text: textparts[i].slice(match[0].length) })
    //         }
    //         else {
    //             parts.push({ text: textparts[i] });
    //         }
    //     }
    //     var additionalY = 0;
    //     for (const part of parts) {
    //         if (part.text) {
    //             doc.text2(part.text, x, y + additionalY, 0, 0, 0, 0, false, options);
    //         }
    //     }
    // }

    return doc;
}

function clearFormatting(text: string) {
    // var clean = text.replace(/☈|↭|↯|☄|↬|☍|☋|/g, '');
    var clean = cleanStlyleChars(text);
    // var clean = text.replace(/\*/g, '');
    // clean = clean.replace(/_/g, '');
    return clean;
}

function inline(text: string) {
    return text.replace(/\n/g, ' ');
}

function finishDoc(doc: any, filepath: string) {

    Docx.Packer.toBuffer(doc).then((buffer) => {
        fs.writeFileSync(filepath, buffer);
    });
}


var get_title_page_token = function (parsed: any, type: string): any {
    var result = null;
    if (parsed && parsed.title_page) {
        for (const section of Object.keys(parsed.title_page)) {
            parsed.title_page[section].forEach(function (token: any) {
                if (token.is(type)) {
                    result = token;
                }
            });
        }

    }
    return result;
};

async function generate(doc: any, opts: any, lineStructs?: Map<number, lineStruct>) {
    var parsed = opts.parsed,
        cfg = opts.config,
        print = opts.print,
        lines = parsed.lines,
        exportcfg = opts.exportconfig,
        exportcfg = opts.exportconfig,
        chinaFormat = 0; //是否国内剧本格式; 0,国际剧本格式；1，国内剧本，带△ ；2，国内剧本，不带 △ 。 （区别于好莱坞剧本格式）
    // var pageIdx = 0;
    var line_height = opts.line_height;

    if (opts.metadata) {
        if (opts.metadata.chinaFormat) {
            chinaFormat = opts.metadata.chinaFormat;
        }
    }
    // console.log(chinaFormat)

    var sceneOrSectionOrTranStarted = false // 第一个场景头出现之前的内容，不打印页码，也不要算尽实际页数统计。 -1未确定第一个场景头页码。其他，第一个页码需减去多少
    var sceneStarted = false // 第一个场景头出现之前的内容，不打印 三角形


    var bottom_notes = cfg.note_position_bottom
    // console.log(print, lines, exportcfg, pageIdx, bottom_notes, lineStructs);

    // var pagesHeight: { [key: number]: number } = {};

    var title_token = get_title_page_token(parsed, 'title');
    var author_token = get_title_page_token(parsed, 'author');
    if (!author_token) {
        author_token = get_title_page_token(parsed, 'authors');
    }

    doc.options.creator = author_token ? clearFormatting(inline(author_token.text)) : '';
    doc.options.title = title_token ? clearFormatting(inline(title_token.text)) : '';

    // 页面尺寸配置，需要设置到每个 section对象的properties属性去
    // var bmar = print.page_height - (print.lines_per_page * line_height) - print.top_margin 
    var sesctionProps = {
        page: {
            size: {
                height: Docx.convertInchesToTwip(print.page_height),
                width: Docx.convertInchesToTwip(print.page_width),
            },
            margin: {
                top: Docx.convertInchesToTwip(print.top_margin),
                right: Docx.convertInchesToTwip(print.right_margin),
                bottom: Docx.convertInchesToTwip(print.bottom_margin),
                left: Docx.convertInchesToTwip(print.left_margin),
                header: Docx.convertInchesToTwip(print.page_number_top_margin),
                footer: Docx.convertInchesToTwip(print.page_number_top_margin - line_height),
            },
            pageNumbers: {
                start: 1
            }
        },
    }

    var fontSize = print.font_size || 12
    fontSize = fontSize * 2 // docx bug ？ must double
    // var c_spacing = print.character_spacing * 20;

    // 内宽
    var innerWidth = Docx.convertInchesToTwip(print.page_width) - Docx.convertInchesToTwip(print.left_margin) - Docx.convertInchesToTwip(print.right_margin);

    // 缩进：
    // var shift_scene_number = (cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'left') ? 6 * print.font_width : 0; // 场景号缩进
    // var sceneIndent = Docx.convertInchesToTwip(print.scene_heading.feed - print.left_margin - shift_scene_number); // 场景

    var shift_scene_number = Docx.convertInchesToTwip((cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'left') ? 7 * print.font_width : 0); // 场景号缩进
    var sceneIndent = Docx.convertInchesToTwip(print.scene_heading.feed - print.left_margin) - shift_scene_number; // 场景

    // var sectionIndent = Docx.convertInchesToTwip(print.section.feed - print.left_margin); // 章节
    var actionIndent = Docx.convertInchesToTwip(print.action.feed - print.left_margin);

    // 单对话：
    var dialIndent = Docx.convertInchesToTwip(print.dialogue.feed - print.left_margin); // 对话缩进
    var parentheticalIndent = Docx.convertInchesToTwip(print.parenthetical.feed - print.left_margin); //对话伴随动作缩进
    var chartorIndent = Docx.convertInchesToTwip(print.character.feed - print.left_margin); // 角色名缩进

    // 双对话：
    var dial_double_tab_colume_width = (innerWidth - actionIndent - actionIndent) / 2

    var dialIndent_out = Docx.convertInchesToTwip(3 * print.font_width) // 双对话 - 外侧缩进
    var parentheticalIndent_out = dialIndent_out * 2 // 双对话伴随动作 - 外侧缩进
    var chartorIndent_out = dialIndent_out * 3 // 双对话角色 - 外侧缩进

    var dialIndent_in = dialIndent_out / 2 // 双对话 - 内侧缩进
    var parentheticalIndent_in = parentheticalIndent_out - dialIndent_in // 双对话伴随动作 - 内侧缩进
    var chartorIndent_in = chartorIndent_out - dialIndent_in// 双对话角色 - 内侧缩进


    var bordersNone: Docx.ITableBordersOptions = {
        top: {
            size: 0,
            space: 0,
            style: "none"
        },
        bottom: {
            size: 0,
            space: 0,
            style: "none"
        },
        left: {
            size: 0,
            space: 0,
            style: "none"
        },
        right: {
            size: 0,
            space: 0,
            style: "none"
        },
        insideHorizontal: {
            size: 0,
            space: 0,
            style: "none"
        },
        insideVertical: {
            size: 0,
            space: 0,
            style: "none"
        }
    };

    var spacing = {
        line: Docx.convertInchesToTwip(line_height), //docx bug? must -3
        lineRule: Docx.LineRuleType.EXACT,
    }

    doc.options.styles = {
        default: {
            document: {
                run: {
                    font: doc.fontNames.get('normal'),
                    size: fontSize,
                    // characterSpacing: c_spacing,
                },
                paragraph: {
                    spacing: spacing,
                },
            },
        },
        paragraphStyles: [
            {
                id: "section",
                name: "Section",
                basedOn: "Normal",
                next: "Normal",
                run: {
                    color: print.section.color
                },
                paragraph: {
                    // indent: {
                    //     left: sectionIndent,
                    //     right: sectionIndent,
                    // },
                    spacing: spacing,
                },
            },
            {
                id: "scene",
                name: "Scene",
                basedOn: "Normal",
                next: "Normal",
                // run: {
                //     font: cfg.embolden_scene_headers ? opts.found_font_bold ? doc.fontNames.get("bold") : doc.fontNames.get("normal") : doc.fontNames.get("normal"),
                //     bold: cfg.embolden_scene_headers ? !opts.found_font_bold : false,
                //     underline: {
                //         type: cfg.underline_scene_headers ? Docx.UnderlineType.SINGLE : Docx.UnderlineType.NONE,
                //     },
                // },
                paragraph: {
                    indent: {
                        left: sceneIndent,
                        right: sceneIndent,
                    },
                    spacing: spacing,
                },
            },
            {
                id: "action",
                name: "Action",
                basedOn: "Normal",
                next: "Normal",
                run: {
                    font: doc.fontNames.get("normal"),
                },
                paragraph: {
                    indent: {
                        left: actionIndent,
                        right: actionIndent,
                    },
                    spacing: spacing,
                },
            },
            {
                id: "character",
                name: "Character",
                basedOn: "Normal",
                next: "Normal",
                // run: {
                //     font: cfg.embolden_character_names ? opts.found_font_bold ? doc.fontNames.get("bold") : doc.fontNames.get("normal") : doc.fontNames.get("normal"),
                //     bold: cfg.embolden_character_names ? !opts.found_font_bold : false,
                // },
                paragraph: {
                    indent: {
                        left: chartorIndent,
                        right: chartorIndent,
                    },
                    spacing: spacing,
                },
            },
            {
                id: "parenthetical",
                name: "Parenthetical",
                basedOn: "Normal",
                next: "Normal",
                // run: {
                //     ...doc.runItalic
                // },
                paragraph: {
                    indent: {
                        left: parentheticalIndent,
                        right: parentheticalIndent,
                    },
                    spacing: spacing,
                },
            },
            {
                id: "dial",
                name: "Dial",
                basedOn: "Normal",
                next: "Normal",
                // run: {
                //     ...doc.runItalic
                // },
                paragraph: {
                    indent: {
                        left: dialIndent,
                        right: dialIndent,
                    },
                    spacing: spacing,
                },
            },
            {
                id: "notes",
                name: "Notes",
                basedOn: "Normal",
                next: "Normal",
                run: {
                    ...doc.runNotes
                },
                paragraph: {
                    indent: {
                        left: actionIndent,
                        right: actionIndent,
                    },
                    spacing: {
                        line: Docx.convertInchesToTwip(print.note_line_height), //docx bug? must -3
                        lineRule: Docx.LineRuleType.EXACT,
                    }
                },
            },
        ],
        characterStyles: [
            {
                id: "underline",
                name: "Underline",
                basedOn: "Normal",
                quickFormat: true,
                run: {
                    underline: {
                        type: Docx.UnderlineType.SINGLE,
                    },
                },
            },
            {
                id: "bold",
                name: "Bold",
                basedOn: "Normal",
                quickFormat: true,
                run: {
                    ...doc.runBold
                },
            },
            {
                id: "italic",
                name: "Italic",
                basedOn: "Normal",
                quickFormat: true,
                run: {
                    ...doc.runItalic
                },
            },
            {
                id: "boldItalic",
                name: "runBoldItalic",
                basedOn: "Normal",
                quickFormat: true,
                run: {
                    ...doc.runBoldItalic
                },
            },
        ],
    }
    // var sectionMain = {
    //     properties: {},
    //     children: [] as Paragraph[],
    // }

    // title page
    var sectionTitlePage = null;
    if (cfg.print_title_page && parsed.title_page) {

        if (parsed.title_page['tl'].length > 0 || parsed.title_page['tc'].length > 0 || parsed.title_page['tr'].length > 0 ||
            parsed.title_page['bl'].length > 0 || parsed.title_page['cc'].length > 0 || parsed.title_page['br'].length > 0
        ) {

            const joinChar = '\n\n';
            //top left
            var tltext = parsed.title_page['tl'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            //top center
            var tctext = parsed.title_page['tc'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            //top right
            var trtext = parsed.title_page['tr'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            //bottom left
            var bltext = parsed.title_page['bl'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            //bottom right
            var brtext = parsed.title_page['br'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            //center center
            var cctext = parsed.title_page['cc'].sort(helpers.sort_index).map((x: any) => x.text).join(joinChar);

            sectionTitlePage = {
                properties: sesctionProps,
                children: [
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth / 3,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.LEFT,
                                y: Docx.VerticalPositionAlign.TOP,
                            },
                        },
                        children: doc.text2(tltext),
                    }),
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth / 3,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.CENTER,
                                y: Docx.VerticalPositionAlign.TOP,
                            },
                        },
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.text2(tctext),
                    }),
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth / 3,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.RIGHT,
                                y: Docx.VerticalPositionAlign.TOP,
                            },
                        },
                        alignment: Docx.AlignmentType.RIGHT,
                        children: doc.text2(trtext),
                    }),
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.CENTER,
                                y: Docx.VerticalPositionAlign.CENTER,
                            },
                        },
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.text2(cctext),
                    }),
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth / 2,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.LEFT,
                                y: Docx.VerticalPositionAlign.BOTTOM,
                            },
                        },
                        children: doc.text2(bltext),
                    }),
                    new Docx.Paragraph({
                        spacing: spacing,
                        frame: {
                            type: "alignment",
                            width: innerWidth / 2,
                            height: 0,
                            anchor: {
                                horizontal: Docx.FrameAnchorType.MARGIN,
                                vertical: Docx.FrameAnchorType.MARGIN,
                            },
                            alignment: {
                                x: Docx.HorizontalPositionAlign.RIGHT,
                                y: Docx.VerticalPositionAlign.BOTTOM,
                            },
                        },
                        alignment: Docx.AlignmentType.RIGHT,
                        children: doc.text2(brtext),
                    }),
                ],
            }

        }

    }


    function print_page_number() {
        if (cfg.show_page_numbers) {
            var res = [];

            var spl = cfg.show_page_numbers.split(/({n})/);
            for (var i = 0; i < spl.length; i++) {
                if (spl[i] == '{n}') {
                    res.push(Docx.PageNumber.CURRENT);
                } else {
                    res.push(spl[i]);
                }
            }
            return [new Docx.TextRun({
                children: res,
            })];
        } else {
            return [];
        }
    }

    let lastDialTableLeft: Docx.Paragraph[] = [];
    let lastDialTableRight: Docx.Paragraph[] = [];
    let lastDialGr: any = null; //国内格式对话第一行
    let lastDialGrLeft: any = null; //国内格式对话第一行
    let lastDialGrRight: any = null; //国内格式对话第一行
    function getSectionMain() {
        if (sceneOrSectionOrTranStarted) {
            return sectionMain;
        }
        return sectionMainNoPageNum;
    }
    function finish_china_dial_first() {
        if (lastDialGr) {
            getSectionMain().children.push(
                new Docx.Paragraph(lastDialGr)
            );
            lastDialGr = null;
        }
        if (lastDialGrLeft) {
            lastDialTableLeft.push(
                new Docx.Paragraph(lastDialGrLeft)
            );
            lastDialGrLeft = null;
        }
        if (lastDialGrRight) {
            lastDialTableRight.push(
                new Docx.Paragraph(lastDialGrRight)
            );
            lastDialGrRight = null;
        }
    }
    function finish_double_dial() {
        if (lastDialGrLeft) {
            lastDialTableLeft.push(
                new Docx.Paragraph(lastDialGrLeft)
            );
            lastDialGrLeft = null;
        }
        if (lastDialGrRight) {
            lastDialTableRight.push(
                new Docx.Paragraph(lastDialGrRight)
            );
            lastDialGrRight = null;
        }
        if (lastDialTableLeft.length > 0 || lastDialTableRight.length > 0) {
            // ....
            getSectionMain().children.push(
                new Docx.Table({
                    indent: {
                        size: actionIndent,
                        type: Docx.WidthType.DXA
                    },
                    borders: bordersNone,
                    rows: [
                        new Docx.TableRow({
                            children: [
                                new Docx.TableCell({
                                    width: {
                                        size: dial_double_tab_colume_width,
                                        type: Docx.WidthType.DXA,
                                    },
                                    children: lastDialTableLeft,
                                }),
                                new Docx.TableCell({
                                    width: {
                                        size: dial_double_tab_colume_width,
                                        type: Docx.WidthType.DXA,
                                    },
                                    children: lastDialTableRight,
                                }),
                            ],
                        }),
                    ],
                })
            )

            if (lastDialTableRight.length == 0) {
                // 只有左侧有对话，表格后补一个空行
                getSectionMain().children.push(new Docx.Paragraph(""));
            }

            lastDialTableLeft = [];
            lastDialTableRight = [];
        }
    }


    var sectionMainNoPageNum = {
        properties: sesctionProps,
        headers: {
            default: new Docx.Header({ // The standard default header on every page or header on odd pages when the 'Different Odd & Even Pages' option is activated
                children: [
                    new Docx.Paragraph({
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.format_text(cfg.print_header, {
                            color: '#777777'
                        }),
                    }),
                ],
            }),
        },
        footers: {
            default: new Docx.Footer({ // The standard default footer on every page or footer on odd pages when the 'Different Odd & Even Pages' option is activated
                children: [
                    new Docx.Paragraph({
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.format_text(cfg.print_footer, {
                            color: '#777777'
                        }),
                    }),
                ],
            }),
        },
        children: [] as any[],
    };
    var sectionMain = {
        properties: sesctionProps,
        headers: {
            default: new Docx.Header({ // The standard default header on every page or header on odd pages when the 'Different Odd & Even Pages' option is activated
                children: [
                    new Docx.Paragraph({
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.format_text(cfg.print_header, {
                            color: '#777777'
                        }),
                    }),
                ],
            }),
        },
        footers: {
            default: new Docx.Footer({ // The standard default footer on every page or footer on odd pages when the 'Different Odd & Even Pages' option is activated
                children: [
                    new Docx.Paragraph({
                        alignment: Docx.AlignmentType.CENTER,
                        children: doc.format_text(cfg.print_footer, {
                            color: '#777777'
                        }),
                    }),
                    new Docx.Paragraph({
                        alignment: Docx.AlignmentType.RIGHT,
                        children: print_page_number(),
                    }),
                ],
            }),
        },
        children: [] as any[],
    };

    let outlineDepth = 0;
    let currentScene: string = "";
    let currentSections: string[] = [];
    let currentDuration: number = 0;
    let pageStarted = false;
    let notesPage: { [key: number]: any } = {};
    let currentLineNotes: any[] = [];
    // var lastPdfOutlineWasSection = true;

    var page = 0,
        // scene_number: string,
        // prev_scene_continuation_header = '',
        // scene_continuations: { [key: string]: any } = {},
        current_section_level = 0,
        current_section_number: any,
        current_section_token: any,
        section_number = helpers.version_generator(),
        text,
        after_section = false; // helpful to determine synopsis indentation

    for (var ii = 0; ii < lines.length; ii++) {
        var doOutline = -1;
        // 去除页面前面的空行
        if (!pageStarted) {
            // var scene_split = false;

            if (lines[ii].type === "page_break") {
                // 跳过空行
                continue;
            }

            if (lines[ii].type !== "redraw") {

                if (lines[ii].text.trim().length === 0) {
                    // 跳过空行
                    continue;
                }

                if (isBlankLineAfterStlyle(lines[ii].text)) {
                    // 只含有样式字符
                    // 只绘制样式，再跳过
                    doc.text2(lines[ii].text);
                    continue;
                }
            }
            if (lines[ii].type === "redraw" && lines[ii].token) {

                if (isBlankLineAfterStlyle(lines[ii].token.text)) {
                    // 只含有样式字符
                    // 直接跳过，redraw已经绘制过样式
                    // doc.text2(lines[ii].token.text, 0, 0, 0, 0, 0, 0, 0, false);
                    continue;
                }
            }

            // 当页第一个非空行

            pageStarted = true;

        }


        currentLineNotes = [];

        if (lines[ii].type === "character" || lines[ii].type === "parenthetical" || lines[ii].type === "dialogue") {
            if (lines[ii].type === "character") {
                if (lines[ii].token && lines[ii].token.dual !== "right") {
                    // left 或者 sigle
                    finish_double_dial();
                }
            }
        } else {
            // 对话块结束，额外处理 (双对话 /  国内剧本对话)
            finish_china_dial_first();

            if (lastDialTableRight.length > 0) {
                finish_double_dial();
            } else if (lines[ii].type !== "separator") {
                finish_double_dial();
            }
        }

        let line = lines[ii];
        if (line.type === "page_break") {
            // 非页面开头的换页，页面中间出现的换页符。
            // 或者 满足 页面自动换页

            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }

            getSectionMain().children.push(new Docx.Paragraph({
                children: [
                    new Docx.PageBreak(),
                ],
            }))

            pageStarted = false;

        }
        else if (line.type === "separator") {
            // 页面中间出现的空行，非页面开头的空行
            // if (line.text) {
            // 绘制样式. 可能是连续块最后一行后的空行样式字符，清理样式。
            if (lastDialTableLeft.length > 0) {
                doc.text2(line.text, null, bottom_notes ? currentLineNotes : null, notesPage)
            } else {
                getSectionMain().children.push(new Docx.Paragraph({
                    style: "action",
                    children: doc.text2(line.text, null, bottom_notes ? currentLineNotes : null, notesPage)
                }));
            }

            // y++;
            // height += line_height;

            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, cumulativeDuration: currentDuration, sections: currentSections.slice(0) })
                }
            }
        } else {
            // formatting not supported yet
            text = line.text;

            var color = (print[line.type] && print[line.type].color) || '#000000';

            var general_text_properties: any = {
                color: color,
                highlight: false,
                bold: false,
                highlightcolor: [0, 0, 0],
                width: 0,
                align: 'left',
                characterSpacing: undefined
            }

            function wrapCharAndDialog(intput: any, lline = line): any {
                if (lline.type === "character") {
                    if (cfg.embolden_character_names) {
                        if (intput.endsWith(cfg.text_contd)) {
                            intput = intput.substring(0, intput.length - cfg.text_contd.length);
                            // intput = charOfStyleTag.bold + intput + charOfStyleTag.bold + cfg.text_contd;
                            intput = addTagAfterBrokenNote(intput, charOfStyleTag.bold) + charOfStyleTag.bold + cfg.text_contd;
                        } else {
                            // intput = charOfStyleTag.bold + intput + charOfStyleTag.bold;
                            intput = addTagAfterBrokenNote(intput, charOfStyleTag.bold) + charOfStyleTag.bold;
                        }
                    }
                    // intput = charOfStyleTag.style_global_stash + intput;
                }
                // if (lline.type === "more") {
                //     intput = charOfStyleTag.style_stash + intput + charOfStyleTag.style_pop;
                // }
                // if (lline.type === "dialogue") {
                //     if (cfg.emitalic_dialog) {
                //         if(!intput.endsWith('*') || !intput.startsWith('*')){
                //             intput = '*' + intput + '*';
                //         }
                //     }
                // }
                return intput
            }
            function get_text_properties(lline = line, expcfg = exportcfg, old_text_properties = general_text_properties) {
                var new_text_properties = Object.assign({}, old_text_properties)
                if (!!expcfg && lline.type === 'character') {
                    // var character = trimCharacterExtension(lline.text)
                    var character = lline.token.character
                    // refer to Liner in ./liner.ts
                    // character = character.replace(/([0-9]* - )/, "");

                    if (!!expcfg.highlighted_characters && expcfg.highlighted_characters.includes(character)) {
                        new_text_properties.highlight = true;
                        new_text_properties.highlightcolor = wordToColor(character);
                    };
                };
                // if (cfg.embolden_character_names && lline.type === 'character') {
                //     new_text_properties.bold = true;
                // }
                return new_text_properties
            }
            function ifResetFormat(intput: any, lline = line): any {
                if (lline.type === "character" || lline.type === "scene_heading" || lline.type === "synopsis"
                    || lline.type === "centered" || lline.type === "section" || lline.type === "transition"
                    || lline.type === "lyric"
                ) {
                    if (!lline.isWrap) {
                        return addTagAfterBrokenNote(intput, charOfStyleTag.style_global_clean);
                    }
                }
                return intput;

            }
            function addTagAfterBrokenNote(intput: any, tag: string): any {
                var istart = intput.indexOf(charOfStyleTag.note_begin);
                var iend = intput.indexOf(charOfStyleTag.note_end);
                if (iend >= 0) {
                    if (istart < 0 || iend < istart) {
                        return intput.substring(0, iend + 1) + tag + intput.substring(iend + 1);
                    }
                }
                return tag + intput;
            }

            var text_properties = get_text_properties();

            if (line.type == "parenthetical" && !text.startsWith("(")) {
                text = " " + text;
            }

            if (line.type === 'centered') {
                text = ifResetFormat(text, line);
                // text2Result = center(text, print.top_margin + height, print.lines_per_page * line_height - height, print.lines_per_page * line_height, print.top_margin, 0, 0, true);

                getSectionMain().children.push(new Docx.Paragraph({
                    style: "action",
                    alignment: Docx.AlignmentType.CENTER,
                    children: doc.text2(text, { align: 'center' }, bottom_notes ? currentLineNotes : null, notesPage)
                }));
                // if (text2Result.breaks > 0) {
                //     height = text2Result.height;
                // } else {
                //     height += text2Result.height;
                // }
            } else if (line.type === "transition") {
                if (!sceneOrSectionOrTranStarted) {
                    sceneOrSectionOrTranStarted = true;
                }
                text = ifResetFormat(chinaFormat ? '(' + text + ')' : text, line);
                getSectionMain().children.push(new Docx.Paragraph({
                    style: "action",
                    alignment: chinaFormat ? Docx.AlignmentType.LEFT : Docx.AlignmentType.RIGHT,
                    children: doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage)
                }));
            } else {
                // action/ dialogue / scene_heading / character / synopsis / / section / lyric

                var hasInvisibleSection = (line.type === "scene_heading" && line.token.invisibleSections != undefined)
                function processSection(sectiontoken: any) {
                    let sectiontext = sectiontoken.text;
                    current_section_level = sectiontoken.level;
                    currentSections.length = sectiontoken.level - 1;

                    currentSections.push(he.encode(sectiontext));
                    if (!hasInvisibleSection) {
                        feed += current_section_level * print.section.level_indent;
                    }
                    if (cfg.number_sections) {
                        if (sectiontoken !== current_section_token) {
                            current_section_number = section_number(sectiontoken.level);
                            current_section_token = sectiontoken;
                            sectiontext = current_section_number + '. ' + sectiontext;
                        } else {
                            sectiontext = Array(current_section_number.length + 3).join(' ') + sectiontext;
                        }

                    }
                    if (cfg.create_bookmarks) {
                        outlineDepth = sectiontoken.level;
                        if (hasInvisibleSection) {
                            return;
                        }
                        doOutline = outlineDepth;
                    }
                    if (!hasInvisibleSection) {
                        text = sectiontext;
                    }
                }
                if (line.type === 'section' || hasInvisibleSection) {
                    if (hasInvisibleSection) {
                        for (let i = 0; i < line.token.invisibleSections.length; i++) {
                            processSection(line.token.invisibleSections[i]);
                        }
                    }
                    else {
                        processSection(line.token);
                    }

                }


                if (line.type === "scene_heading") {
                    if (!sceneOrSectionOrTranStarted) {
                        sceneOrSectionOrTranStarted = true;
                    }
                    if (!sceneStarted) {
                        sceneStarted = true;
                    }

                    if (cfg.create_bookmarks) {
                        // doOutline = outlineDepth + 1;
                        if (cfg.print_sections) {
                            doOutline = 8; //固定最低级
                        } else {
                            doOutline = 0; //固定最高级
                        }
                    }
                    currentScene = text;

                    if (line.number) {

                        if (cfg.scenes_numbers === 'both' || cfg.scenes_numbers === 'left') {
                            var scene_number = String(line.number);
                            var scene_text_length = scene_number.length;

                            var leftChar = (5 - scene_text_length) * 3;
                            if (leftChar < 0) leftChar = 0;
                            // 在前面补i空格：
                            scene_number = Array(leftChar).join(' ') + scene_number;
                            text = scene_number + '      ' + text;
                        }
                        // docx 暂时不支持 right number

                    }

                    if (cfg.embolden_scene_headers) {
                        // text = charOfStyleTag.bold + text + charOfStyleTag.bold;
                        text = addTagAfterBrokenNote(text, charOfStyleTag.bold) + charOfStyleTag.bold;
                    }
                    if (cfg.underline_scene_headers) {
                        // text = charOfStyleTag.underline + text + charOfStyleTag.underline;
                        text = addTagAfterBrokenNote(text, charOfStyleTag.underline) + charOfStyleTag.underline;
                    }
                    // text = charOfStyleTag.style_global_stash + text;

                }

                text = wrapCharAndDialog(text, line)


                if (print[line.type] && print[line.type].italic && text) {
                    // text = charOfStyleTag.italic + text + charOfStyleTag.italic;
                    text = addTagAfterBrokenNote(text, charOfStyleTag.italic) + charOfStyleTag.italic;
                }


                // 构建 graph
                text = ifResetFormat(text, line);

                if (line.type === "character") {
                    if (chinaFormat) {
                        finish_china_dial_first();
                        text = text + ': ';
                    }
                    var runs = doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage);
                    if (line.token && line.token.dual === "left") {
                        // 同时对白
                        if (chinaFormat) {
                            lastDialGrLeft = {
                                style: "dial",
                                indent: {
                                    left: dialIndent_out,
                                    right: dialIndent_in,
                                },
                                children: runs,
                            };
                        } else {
                            lastDialTableLeft.push(
                                new Docx.Paragraph({
                                    style: "character",
                                    indent: {
                                        left: chartorIndent_out,
                                        right: chartorIndent_in,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    }
                    else if (line.token && line.token.dual === "right") {
                        // 同时对白
                        if (chinaFormat) {
                            lastDialGrRight = {
                                style: "dial",
                                indent: {
                                    left: dialIndent_in,
                                    right: dialIndent_out,
                                },
                                children: runs,
                            };
                        } else {
                            lastDialTableRight.push(
                                new Docx.Paragraph({
                                    style: "character",
                                    indent: {
                                        left: chartorIndent_in,
                                        right: chartorIndent_out,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    } else {
                        if (chinaFormat) {
                            lastDialGr = {
                                style: "action",
                                children: runs,
                            };
                        } else {
                            getSectionMain().children.push(new Docx.Paragraph({
                                style: "character",
                                children: runs
                            }));
                        }
                    }

                }
                else if (line.type === "parenthetical") {
                    var runs = doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage);
                    if (line.token && line.token.dual === "left") {
                        // 同时对白
                        if (chinaFormat) {
                            if (lastDialGrLeft) {
                                lastDialGrLeft.children.push(...runs);
                            } else {
                                lastDialTableLeft.push(
                                    new Docx.Paragraph({
                                        style: "dial",
                                        indent: {
                                            left: dialIndent_out,
                                            right: dialIndent_in,
                                        },
                                        children: runs,
                                    })
                                )
                            }
                        } else {
                            lastDialTableLeft.push(
                                new Docx.Paragraph({
                                    style: "parenthetical",
                                    indent: {
                                        left: parentheticalIndent_out,
                                        right: parentheticalIndent_in,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    }
                    else if (line.token && line.token.dual === "right") {
                        // 同时对白
                        if (chinaFormat) {

                            if (lastDialGrRight) {
                                lastDialGrRight.children.push(...runs);
                            } else {
                                lastDialTableRight.push(
                                    new Docx.Paragraph({
                                        style: "dial",
                                        indent: {
                                            left: dialIndent_in,
                                            right: dialIndent_out,
                                        },
                                        children: runs,
                                    })
                                )

                            }
                        } else {
                            lastDialTableRight.push(
                                new Docx.Paragraph({
                                    style: "parenthetical",
                                    indent: {
                                        left: parentheticalIndent_in,
                                        right: parentheticalIndent_out,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    } else {
                        if (chinaFormat) {

                            if (lastDialGr) {
                                lastDialGr.children.push(...runs);
                            } else {
                                getSectionMain().children.push(new Docx.Paragraph({
                                    style: "action",
                                    children: runs
                                }));
                            }
                        } else {
                            getSectionMain().children.push(new Docx.Paragraph({
                                style: "parenthetical",
                                children: runs
                            }));
                        }
                    }
                }
                else if (line.type === "dialogue") {
                    var runs = doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage);
                    if (line.token && line.token.dual === "left") {
                        // 同时对白
                        if (chinaFormat) {
                            if (lastDialGrLeft) {
                                lastDialGrLeft.children.push(...runs);
                                lastDialTableLeft.push(
                                    new Docx.Paragraph(lastDialGrLeft)
                                );
                                lastDialGrLeft = null;
                            } else {
                                lastDialTableLeft.push(
                                    new Docx.Paragraph({
                                        style: "dial",
                                        indent: {
                                            left: dialIndent_out,
                                            right: dialIndent_in,
                                        },
                                        children: runs,
                                    })
                                )
                            }
                        } else {
                            lastDialTableLeft.push(
                                new Docx.Paragraph({
                                    style: "dial",
                                    indent: {
                                        left: dialIndent_out,
                                        right: dialIndent_in,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    }
                    else if (line.token && line.token.dual === "right") {
                        // 同时对白
                        if (chinaFormat) {
                            if (lastDialGrRight) {
                                lastDialGrRight.children.push(...runs);
                                lastDialTableRight.push(
                                    new Docx.Paragraph(lastDialGrRight)
                                );
                                lastDialGrRight = null;
                            } else {
                                lastDialTableRight.push(
                                    new Docx.Paragraph({
                                        style: "dial",
                                        indent: {
                                            left: dialIndent_in,
                                            right: dialIndent_out,
                                        },
                                        children: runs,
                                    })
                                )

                            }
                        } else {
                            lastDialTableRight.push(
                                new Docx.Paragraph({
                                    style: "dial",
                                    indent: {
                                        left: dialIndent_in,
                                        right: dialIndent_out,
                                    },
                                    children: runs,
                                })
                            )
                        }
                    } else {
                        if (chinaFormat) {
                            if (lastDialGr) {
                                lastDialGr.children.push(...runs);
                                getSectionMain().children.push(
                                    new Docx.Paragraph(lastDialGr)
                                );
                                lastDialGr = null;
                            } else {
                                getSectionMain().children.push(new Docx.Paragraph({
                                    style: "action",
                                    children: runs
                                }));
                            }
                        } else {
                            getSectionMain().children.push(new Docx.Paragraph({
                                style: "dial",
                                children: runs
                            }));
                        }
                    }
                }
                else if (line.type === "scene_heading") {
                    text_properties.characterSpacing = 0
                    getSectionMain().children.push(new Docx.Paragraph({
                        style: "scene",
                        outlineLevel: doOutline > -1 ? doOutline : null,
                        children: doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage)
                    }));
                }
                else if (line.type === "section") {
                    if (!sceneOrSectionOrTranStarted) {
                        sceneOrSectionOrTranStarted = true;
                    }
                    var feed: number = (print[line.type] || {}).feed || print.action.feed;
                    feed += current_section_level * print.section.level_indent;
                    var sectionIndent = Docx.convertInchesToTwip(feed - print.action.feed);

                    getSectionMain().children.push(new Docx.Paragraph({
                        style: "section",
                        indent: {
                            left: sectionIndent,
                            right: sectionIndent,
                        },
                        outlineLevel: doOutline > -1 ? doOutline : null,
                        children: doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage)
                    }));
                }
                else if (line.type === "synopsis") {
                    var feed: number = (print[line.type] || {}).feed || print.action.feed;
                    if (print.synopsis.feed_with_last_section && after_section) {
                        feed += current_section_level * print.section.level_indent;
                    } else {
                        feed = print.action.feed;
                    }
                    feed += print.synopsis.padding || 0;
                    var sectionIndent = Docx.convertInchesToTwip(feed - print.action.feed);

                    getSectionMain().children.push(new Docx.Paragraph({
                        style: "action",
                        indent: {
                            left: sectionIndent,
                            right: sectionIndent,
                        },
                        children: doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage)
                    }));
                }
                else {
                    // action / lyric
                    if (chinaFormat === 1 && sceneStarted) {
                        text = '△' + ' ' + text;
                    }
                    getSectionMain().children.push(new Docx.Paragraph({
                        style: "action",
                        children: doc.text2(text, text_properties, bottom_notes ? currentLineNotes : null, notesPage)
                    }));
                }
            }
            // y++;
            if (lineStructs) {
                if (line.token.line && !lineStructs.has(line.token.line)) {
                    if (line.token.time) currentDuration += line.token.time;
                    lineStructs.set(line.token.line, { page: page, scene: currentScene, sections: currentSections.slice(0), cumulativeDuration: currentDuration })
                }
            }
        }

        if (pageStarted) {
            // clear after section
            if (line.type === 'section') {
                after_section = true;
            } else if (line.type === 'scene_heading') {
                after_section = false;
            }

        }

    }

    if (notesPage[0] && notesPage[0].length > 0) {
        var footnotes: any = {};

        var notes = notesPage[0];
        for (var i = 0; i < notes.length; i++) {
            // token 行
            var token = notes[i];
            for (var j = 0; j < token.length; j++) {


                var children = [];
                for (var k = 0; k < token[j].text.length; k++) {
                    var text = token[j].text[k];
                    if (k == 0) {
                        //去掉第一个字符
                        text = text.substring(1);

                    }
                    if (k == token[j].text.length - 1) {
                        //去掉最后一个字符
                        text = text.substring(0, text.length - 1);
                    }


                    // if (chinaFormat === 1 && text.startsWith('△')) {
                    //     text = text.substring(1);
                    // }

                    // doc.format_text(text, {
                    //     color: '#868686',
                    //     line_break: false,
                    //     align: 'left',
                    // });

                    children.push(new Docx.Paragraph({
                        style: "notes",
                        children: doc.format_text(text, { color: '#868686', fontSize: print.note_font_size || 9, characterSpacing: 0 })
                    }));
                }
                footnotes[token[j].no] = { children: children };
            }
        }
        doc.options.footnotes = footnotes;
    }



    doc.options.sections = [];
    if (sectionTitlePage) {
        doc.options.sections.push(sectionTitlePage)
    }
    if (sectionMainNoPageNum.children.length > 0) {
        doc.options.sections.push(sectionMainNoPageNum)
    }
    if (sectionMain) {
        doc.options.sections.push(sectionMain)
    }
    doc.doc = new Docx.Document(doc.options);
    return Docx.PageNumber.TOTAL_PAGES
}

export var get_docx = async function (opts: Options, progress: vscode.Progress<{ message?: string; increment?: number; }>) {
    progress.report({ message: "Processing document", increment: 25 });
    var doc = await initDoc(opts);
    generate(doc, opts,);
    progress.report({ message: "Writing to disk", increment: 25 });
    finishDoc(doc.doc, opts.filepath);
};

export type lineStruct = {
    sections: string[],
    scene: string,
    page: number,
    cumulativeDuration: number
}

export type docxstats = {
    pagecount: number,//去除换页等空行后的，统计的页数
    pagecountReal: number, //打印的页数
    linemap: Map<number, lineStruct> //the structure of each line
}
export type DocxAsBase64 = {
    data: string;
    stats: docxstats;
}

export var get_docx_stats = async function (opts: Options): Promise<docxstats> {
    var doc = await initDoc(opts);
    let stats: docxstats = { pagecount: 1, pagecountReal: 1, linemap: new Map<number, lineStruct>() };
    // stats.pagecount = opts.parsed.lines.length / opts.print.lines_per_page;
    // doc.on('pageAdded', () => {
    //     stats.pagecountReal++;
    // });

    var ph = await generate(doc, opts, stats.linemap);
    var lines = ph.length;
    // for (var pIdx in ph) {
    //     var h = ph[pIdx];
    //     lines += Math.round(h / opts.line_height);
    // }
    stats.pagecount = lines * 0;
    return stats;
}


export var get_docx_base64 = async function (opts: Options): Promise<DocxAsBase64> {
    var doc = await initDoc(opts);
    let stats: docxstats = { pagecount: 1, pagecountReal: 1, linemap: new Map<number, lineStruct>() };
    // stats.pagecount = opts.parsed.lines.length / opts.print.lines_per_page;
    // doc.on('pageAdded', () => {
    //     stats.pagecountReal++;
    // });
    var ph = await generate(doc, opts, stats.linemap);
    var lines = 0;
    // for (var pIdx in ph) {
    //     var h = ph[pIdx];
    //     lines += Math.round(h / opts.line_height);
    // }
    lines = ph.length
    stats.pagecount = lines * 0;
    return {
        data: await Docx.Packer.toBase64String(doc.doc),
        stats: stats
    }
}