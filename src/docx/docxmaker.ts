// TODO: Extract docxmaker to a separate library (+++++)

import * as fountainconfig from "../configloader";
import * as print from "../pdf/print";
import * as path from 'path';
import * as vscode from 'vscode';
// import helpers from "../helpers";
// import { cleanStlyleChars, isBlankLineAfterStlyle,  wordToColor } from "../utils";
import { cleanStlyleChars} from "../utils";
// import * as he from 'he';
// import { addTextbox, drawTextLinesOnDocx, measureTextWidth } from 'textbox-for-docxkit';
import { regex } from "../afterwriting-parser";
// import { charOfStyleTag } from "../cons";
import * as fs from "fs";
import { Document, Packer, Paragraph, TextRun ,Header,Footer,PageNumber,AlignmentType} from "docx";

// import * as blobUtil from "blob-util";
export class Options {
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
    var print = opts.print;
    //var fonts = opts.config.fonts || null;
    
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
    var fp = __dirname.slice(0, __dirname.lastIndexOf(path.sep)) + path.sep + 'courierprime' + path.sep
    fontMap.set('ScriptNormal', { name: "ScriptNormal", data: fs.readFileSync(fp + 'courier-prime.ttf'), characterSet: "00" });
    fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(fp + 'courier-prime-bold.ttf'), characterSet: "00" });
    fontMap.set('ScriptBoldOblique', { name: "ScriptBoldOblique", data: fs.readFileSync(fp + 'courier-prime-bold-italic.ttf'), characterSet: "00" });
    fontMap.set('ScriptOblique', { name: "ScriptOblique", data: fs.readFileSync(fp + 'courier-prime-italic.ttf'), characterSet: "00" });
    
    opts.found_font_bold = true;
    opts.found_font_italic = true;
    opts.found_font_bold_italic = true;

    if (opts.font != "Courier Prime") {
        opts.found_font_bold = false;
        opts.found_font_italic = false;
        opts.found_font_bold_italic = false;

        var variants = await fontFinder.listVariants(opts.font);
        var initedMap = new Map<string, number>();
        var weightPathMap = new Map<number, string>();
        var pat = '';
        var normalWei = 0;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    // doc.registerFont('ScriptNormal', variant.path);
                    fontMap.set('ScriptNormal', { name: "ScriptNormal", data: fs.readFileSync(variant.path), characterSet: "00" });
                    pat = variant.path;
                    initedMap.set('ScriptNormal', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    normalWei = variant.weight;
                    break;
                case "bold":
                    // doc.registerFont('ScriptBold', variant.path);
                    fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(variant.path), characterSet: "00" });
                    initedMap.set('ScriptBold', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_bold = true;
                    break;
                case "italic":
                    // doc.registerFont('ScriptOblique', variant.path);
                    fontMap.set('ScriptOblique', { name: "ScriptOblique", data: fs.readFileSync(variant.path), characterSet: "00" });
                    initedMap.set('ScriptOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_italic = true;
                    break;
                case "boldItalic":
                    // doc.registerFont('ScriptBoldOblique', variant.path);
                    fontMap.set('ScriptBoldOblique', { name: "ScriptBoldOblique", data: fs.readFileSync(variant.path), characterSet: "00" });
                    initedMap.set('ScriptBoldOblique', variant.weight);
                    weightPathMap.set(variant.weight, variant.path);
                    opts.found_font_bold_italic = true;
                    break;
                default:
                    weightPathMap.set(variant.weight, variant.path)
                    break
            }
        });
        if (pat === '') {
            var min = 10000;
            var mid = 0;
            weightPathMap.forEach((_path: string, weight: number) => {
                if (weight < 500 && weight > 300) {
                    mid = weight;
                }
                if (weight < min) {
                    min = weight;
                }
            })
            if (mid > 0) {
                // doc.registerFont('ScriptNormal', weightPathMap.get(mid));
                fontMap.set('ScriptNormal', { name: "ScriptNormal", data: fs.readFileSync(weightPathMap.get(mid)), characterSet: "00" });
                pat = weightPathMap.get(mid);
                normalWei = mid;
            } else {
                var p = weightPathMap.get(min);
                if (p) {
                    // doc.registerFont('ScriptNormal', p);
                    fontMap.set('ScriptNormal', { name: "ScriptNormal", data: fs.readFileSync(p), characterSet: "00" });
                    pat = p;
                    normalWei = min;
                }
            }
        }
        if (pat !== '') {
            weightPathMap.forEach((path: string, weight: number) => {
                // if (!initedMap.get('ScriptOblique')) {
                //     if (weight < 400) {
                //         doc.registerFont('ScriptOblique', path);
                //         initedMap.set('ScriptOblique', weight);
                //     }
                // }
                if (!initedMap.get('ScriptBold')) {
                    // if (weight > 400 && weight <= 700) {
                    if (weight > normalWei && weight <= normalWei + 300) {
                        // doc.registerFont('ScriptBold', path);
                        fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(path), characterSet: "00" });
                        initedMap.set('ScriptBold', weight);
                        weightPathMap.set(weight, path);
                        opts.found_font_bold = true;
                    }
                }
                // if (!initedMap.get('ScriptBoldOblique')) {
                //     if (weight > 700) {
                //         doc.registerFont('ScriptBoldOblique', path);
                //         initedMap.set('ScriptBoldOblique', weight);
                //         weightPathMap.set(weight, path);
                //     }
                // }
            })
            // 指定字体，没有粗体/斜体等样式，用常规字体样式替换，避免不能显示打印的问题
            if (!initedMap.get('ScriptBold')) {
                // if (initedMap.get('ScriptBoldOblique')) {
                //     doc.registerFont('ScriptBold', weightPathMap.get(initedMap.get('ScriptBoldOblique')));
                // } else {
                //     doc.registerFont('ScriptBold', pat);
                // }
                weightPathMap.forEach((path: string, weight: number) => {
                    if (!initedMap.get('ScriptBold')) {
                        // if (weight > 400 && weight <= 700) {
                        if (weight > normalWei) {
                            // doc.registerFont('ScriptBold', path);
                            fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(path), characterSet: "00" });
                            initedMap.set('ScriptBold', weight);
                            weightPathMap.set(weight, path);
                            opts.found_font_bold = true;
                        }
                    }
                })
            }
            // if (!initedMap.get('ScriptOblique')) doc.registerFont('ScriptOblique', pat);
            // if (!initedMap.get('ScriptBoldOblique')) {
            //     if (initedMap.get('ScriptBold')) {
            //         doc.registerFont('ScriptBoldOblique', weightPathMap.get(initedMap.get('ScriptBold')));
            //     } else {
            //         doc.registerFont('ScriptBoldOblique', pat);
            //     }
            // }
        }
    }
    if (opts.font_italic !== '') {
        var variants = await fontFinder.listVariants(opts.font_italic);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "italic":
                    hit = true;
                    // doc.registerFont('ScriptOblique', variant.path);
                    fontMap.set('ScriptOblique', { name: "ScriptOblique", data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            // doc.registerFont('ScriptOblique', pat);
            fontMap.set('ScriptOblique', { name: "ScriptOblique", data: fs.readFileSync(pat), characterSet: "00" });
            opts.found_font_italic = true;
        }
        else if (!hit && patDf !== '') {
            // doc.registerFont('ScriptOblique', patDf);
            fontMap.set('ScriptOblique', { name: "ScriptOblique", data: fs.readFileSync(patDf), characterSet: "00" });
            opts.found_font_italic = true;
        }
    }
    if (opts.font_bold !== '') {
        var variants = await fontFinder.listVariants(opts.font_bold);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "bold":
                    hit = true;
                    // doc.registerFont('ScriptBold', variant.path);
                    fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_bold = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            // doc.registerFont('ScriptBold', pat);
            fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(pat), characterSet: "00" });
            opts.found_font_bold = true;
        }
        else if (!hit && patDf !== '') {
            // doc.registerFont('ScriptBold', patDf);
            fontMap.set('ScriptBold', { name: "ScriptBold", data: fs.readFileSync(patDf), characterSet: "00" });
            opts.found_font_bold = true;

        }
    }
    if (opts.font_bold_italic !== '') {
        var variants = await fontFinder.listVariants(opts.font_bold_italic);
        var pat = '';
        var patDf = '';
        var hit = false;
        variants.forEach((variant: any) => {
            switch (variant.style) {
                case "regular":
                    pat = variant.path;
                    break;
                case "boldItalic":
                    hit = true;
                    // doc.registerFont('ScriptBoldOblique', variant.path);
                    fontMap.set('ScriptBoldOblique', { name: "ScriptBoldOblique", data: fs.readFileSync(variant.path), characterSet: "00" });
                    opts.found_font_bold_italic = true;
                    break;
                default:
                    patDf = variant.path;
                    break
            }
        });
        if (!hit && pat !== '') {
            // doc.registerFont('ScriptBoldOblique', pat);
            fontMap.set('ScriptBoldOblique', { name: "ScriptBoldOblique", data: fs.readFileSync(pat), characterSet: "00" });
            opts.found_font_bold_italic = true;
        }
        else if (!hit && patDf !== '') {
            // doc.registerFont('ScriptBoldOblique', patDf);
            fontMap.set('ScriptBoldOblique', { name: "ScriptBoldOblique", data: fs.readFileSync(patDf), characterSet: "00" });
            opts.found_font_bold_italic = true;
        }
    }

    // doc.font('ScriptNormal');
    // doc.fontSize(print.font_size || 12);
    
    var fontsArr = Array.from(fontMap.values());
    
    var options: any = {
        creator: "Arming",
        description: "My screenplay document",
        title: "My Screenplay",
        styles: {
            default: {
                document: {
                    run: {
                        font: "ScriptNormal",
                        fontSize: print.font_size || 12,
                    },
                },
            },
        },
        fonts: fontsArr,
    };
    var doc: any = {options: options};

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
    doc.simple_text = function () {
        doc.font('ScriptNormal');
        doc.text.apply(doc, arguments);
    };
    // 缓存doc样式画了后，再恢复之前的样式
    doc.format_text = function (text: string, x: number, y: number, options: any) {
        doc.global_stash();
        doc.text2(text, x, y, 0, 0, 0, 0, 0, false, options);
        doc.global_pop();
    };

    doc.currentNote = {
        pageIdx: -1,
        note: [] as any[]
    }

    // doc.text2 = function (text: string, x: number, y: number, posTop: number, firstBreakHeight: number, breakHeight: number, switchPageFrom: number, switchPageTo: number, onlyGetLines: boolean, options: any, currentLineNotes?: any, notesPage?: any, pageIdx?: number): any {
    //     options = options || {};
    //     var color = options.color || 'black';
    //     color = doc.format_state.override_color ? doc.format_state.override_color : color;

    //     doc.fill(color);

    //     var catchNotes = false;
    //     if (currentLineNotes && notesPage) {
    //         catchNotes = true;
    //     }

    //     function note_lines(pageIdx: number) {
    //         var l = 0;
    //         var notes = notesPage[pageIdx];
    //         if (notes) {
    //             // 页
    //             for (let i = 0; i < notes.length; i++) {
    //                 // token 行
    //                 for (let j = 0; j < notes[i].length; j++) {
    //                     // 每个token有几个note
    //                     for (let k = 0; k < notes[i][j].text.length; k++) {
    //                         // 每个note的行
    //                         l++;
    //                     }
    //                 }
    //             }
    //         }
    //         // if(l>0){
    //         //     l +=1;
    //         // }
    //         return l;
    //     }

    //     if (options.highlight) {
    //         // doc.highlight(x * 72, (y * 72),
    //         //     measureTextWidth(cleanStlyleChars(text), 'ScriptNormal', print.font_size || 12, doc),
    //         //     doc.currentLineHeight(), { color: options.highlightcolor });
    //         // TODO Arming (2024-12-10) : 
    //     }

    //     if (print.note.italic) {
    //         // text = text.replace(/↺/g, '*↺').replace(/↻/g, '↻*');
    //         text = text.replace(new RegExp(charOfStyleTag.note_begin, 'g'), charOfStyleTag.italic + charOfStyleTag.note_begin).
    //             replace(new RegExp(charOfStyleTag.note_end, 'g'), charOfStyleTag.note_end + charOfStyleTag.italic);
    //     }
    //     var links: { start: number, length: number, url: string }[] = [];
    //     if (options.links) {
    //         let match;
    //         //Clean up all the links, while keeping track of their offset in order to add them back in later.
    //         while ((match = regex.link.exec(text)) !== null) {
    //             match.index;
    //             var trimmed = match[3];
    //             links.push({
    //                 start: match.index,
    //                 length: trimmed.length,
    //                 url: match[6]
    //             });
    //             text = text.slice(0, match.index) + match[3] + text.slice(match.index + match[0].length);
    //         }
    //     }
    //     var split_for_formatting = [];
    //     //Split the text from the start (or from the previous link) until the current one
    //     //"This is a link: google.com and this is after"
    //     // |--------------|----------| - - - - - - - |
    //     var prevlink = 0;
    //     for (let i = 0; i < links.length; i++) {
    //         split_for_formatting.push(text.slice(prevlink, links[i].start));
    //         split_for_formatting.push(text.slice(links[i].start, links[i].start + links[i].length));
    //         prevlink = links[i].start + links[i].length;
    //     }
    //     //...And then add whatever is left over
    //     //"This is a link: google.com and this is after"
    //     // | - - - - - - -| - - - - -|----------------|
    //     var leftover = text.slice(prevlink, text.length);
    //     if (leftover) split_for_formatting.push(leftover);

    //     //Further sub-split for bold, italic, underline, etc...
    //     for (let i = 0; i < split_for_formatting.length; i++) {
    //         var innersplit = split_for_formatting[i].split(new RegExp('([' + charOfStyleTag.all + '])', 'g')).filter(function (a) {
    //             return a;
    //         });
    //         split_for_formatting.splice(i, 1, ...innersplit);
    //         i += innersplit.length - 1;
    //     }

    //     var width = options.width ? options.width : print.page_width;
    //     // var font_width = print.font_width;
    //     var textobjects = [];
    //     var currentIndex = 0;
    //     var onlyNoteContent = catchNotes && doc.currentNote.pageIdx > -1;
    //     var pushed = false;
    //     // var currentWidth = 0;
    //     for (var i = 0; i < split_for_formatting.length; i++) {
    //         var elem = split_for_formatting[i];
    //         if (elem === charOfStyleTag.style_global_clean) {
    //             doc.reset_format();
    //             color = options.color || 'black';

    //         } else if (elem === charOfStyleTag.style_global_stash) {
    //             doc.global_stash();
    //             color = options.color || 'black';

    //         } else if (elem === charOfStyleTag.style_global_pop) {
    //             doc.global_pop();
    //         }
    //         else if (elem === charOfStyleTag.style_left_stash) {
    //             opts.stash_style_left_clumn = {
    //                 bold_italic: doc.format_state.bold_italic,
    //                 bold: doc.format_state.bold,
    //                 italic: doc.format_state.italic,
    //                 underline: doc.format_state.underline,
    //                 override_color: doc.format_state.override_color,
    //                 italic_global: opts.italic_global,
    //                 italic_dynamic: opts.italic_dynamic,
    //             }
    //             doc.reset_format();
    //             color = options.color || 'black';

    //         } else if (elem === charOfStyleTag.style_left_pop) {
    //             doc.format_state.bold_italic = opts.stash_style_left_clumn.bold_italic;
    //             doc.format_state.bold = opts.stash_style_left_clumn.bold;
    //             doc.format_state.italic = opts.stash_style_left_clumn.italic;
    //             doc.format_state.underline = opts.stash_style_left_clumn.underline;
    //             doc.format_state.override_color = opts.stash_style_left_clumn.override_color;
    //             opts.italic_global = opts.stash_style_left_clumn.italic_global;
    //             opts.italic_dynamic = opts.stash_style_left_clumn.italic_dynamic;
    //         }
    //         else if (elem === charOfStyleTag.style_right_stash) {
    //             opts.stash_style_right_clumn = {
    //                 bold_italic: doc.format_state.bold_italic,
    //                 bold: doc.format_state.bold,
    //                 italic: doc.format_state.italic,
    //                 underline: doc.format_state.underline,
    //                 override_color: doc.format_state.override_color,
    //                 italic_global: opts.italic_global,
    //                 italic_dynamic: opts.italic_dynamic,
    //             }
    //             doc.reset_format();
    //             color = options.color || 'black';
    //         } else if (elem === charOfStyleTag.style_right_pop) {
    //             doc.format_state.bold_italic = opts.stash_style_right_clumn.bold_italic;
    //             doc.format_state.bold = opts.stash_style_right_clumn.bold;
    //             doc.format_state.italic = opts.stash_style_right_clumn.italic;
    //             doc.format_state.underline = opts.stash_style_right_clumn.underline;
    //             doc.format_state.override_color = opts.stash_style_right_clumn.override_color;
    //             opts.italic_global = opts.stash_style_right_clumn.italic_global;
    //             opts.italic_dynamic = opts.stash_style_right_clumn.italic_dynamic;
    //         } else if (elem === charOfStyleTag.italic_global_begin) {
    //             opts.italic_dynamic = doc.format_state.italic; //记录 global 前状态， 在 global 期间记录 italic 的切换记数。
    //             opts.italic_global = true;
    //             doc.format_state.italic = true; // 强制在整个 global 中保持 italic 样式
    //         } else if (elem === charOfStyleTag.italic_global_end) {
    //             doc.format_state.italic = opts.italic_dynamic;
    //             opts.italic_global = false;
    //         } else if (elem === charOfStyleTag.bold_italic) {
    //             // doc.format_state.italic = !doc.format_state.italic;
    //             if (catchNotes && doc.currentNote.pageIdx > -1) {
    //                 if (!pushed) {
    //                     doc.currentNote.note.text.push(elem);
    //                     pushed = true;
    //                 } else {
    //                     doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
    //                 }
    //             } else {
    //                 doc.format_state.bold_italic = !doc.format_state.bold_italic;
    //             }
    //         } else if (elem === charOfStyleTag.bold) {
    //             if (catchNotes && doc.currentNote.pageIdx > -1) {
    //                 if (!pushed) {
    //                     doc.currentNote.note.text.push(elem);
    //                     pushed = true;
    //                 } else {
    //                     doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
    //                 }
    //             } else {
    //                 doc.format_state.bold = !doc.format_state.bold;
    //             }
    //         } else if (elem === charOfStyleTag.italic) {
    //             if (catchNotes && doc.currentNote.pageIdx > -1) {
    //                 if (!pushed) {
    //                     doc.currentNote.note.text.push(elem);
    //                     pushed = true;
    //                 } else {
    //                     doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
    //                 }
    //             } else {
    //                 if (opts.italic_global) {
    //                     opts.italic_dynamic = !opts.italic_dynamic;
    //                 } else {
    //                     doc.format_state.italic = !doc.format_state.italic;
    //                 }
    //             }
    //         } else if (elem === charOfStyleTag.underline) {
    //             if (catchNotes && doc.currentNote.pageIdx > -1) {
    //                 if (!pushed) {
    //                     doc.currentNote.note.text.push(elem);
    //                     pushed = true;
    //                 } else {
    //                     doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
    //                 }
    //             } else {
    //                 doc.format_state.underline = !doc.format_state.underline;
    //             }
    //         } else if (elem === charOfStyleTag.note_end) {
    //             doc.format_state.override_color = null;
    //             color = options.color || 'black';
    //             if (catchNotes) {
    //                 if (currentLineNotes.length > 0) {
    //                     currentLineNotes[currentLineNotes.length - 1].text = doc.currentNote.note.text;
    //                     // if (!notesPage[doc.currentNote.pageIdx]) {
    //                     //  //   notesPage[doc.currentNote.pageIdx] = [];
    //                     // }
    //                     // // if (notesPage[doc.currentNote.pageIdx].length === 0) {
    //                     // // notesPage[doc.currentNote.pageIdx].push([]);// 加一个token行
    //                     // // }
    //                     // // notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].push([...doc.currentNote.note]);
    //                 }
    //                 // else {
    //                 //     // 当前行先不放入，
    //                 // }
    //                 if (notesPage[doc.currentNote.pageIdx]) {
    //                     if (notesPage[doc.currentNote.pageIdx].length > 0) {
    //                         notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1][notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].length - 1].text = doc.currentNote.note.text;
    //                     }
    //                 }
    //                 doc.currentNote.pageIdx = -1;
    //             }
    //         } else {
    //             // 特殊标示 note_begin 以及 正常字符，进入。
    //             if (elem === charOfStyleTag.note_begin) {
    //                 doc.format_state.override_color = (print.note && print.note.color) || '#000000';
    //                 if (catchNotes) {
    //                     var no = 1;
    //                     // if (notesPage[pageIdx]) {
    //                     //     if (notesPage[pageIdx].length > 0) {
    //                     //         if (notesPage[pageIdx][notesPage[pageIdx].length - 1].length > 0) {
    //                     //             no = notesPage[pageIdx][notesPage[pageIdx].length - 1][notesPage[pageIdx][notesPage[pageIdx].length - 1].length - 1].no + 1
    //                     //         }
    //                     //     }
    //                     // }

    //                     doc.currentNote = {
    //                         pageIdx: pageIdx,
    //                         note: { no: no, text: [''] },
    //                     };
    //                     if (!notesPage[doc.currentNote.pageIdx]) {
    //                         notesPage[doc.currentNote.pageIdx] = [];
    //                     }
    //                     if (currentLineNotes.length === 0) {
    //                         notesPage[doc.currentNote.pageIdx].push([]);// 加一个token行
    //                     }
    //                     notesPage[doc.currentNote.pageIdx][notesPage[doc.currentNote.pageIdx].length - 1].push({ no: no, text: [''] });
    //                     currentLineNotes.push({ no: no, text: [''] });
    //                     pushed = true;
    //                 }
    //             }

    //             if (elem !== charOfStyleTag.note_begin || catchNotes) {

    //                 var draw = true;
    //                 if (elem !== charOfStyleTag.note_begin) {
    //                     if (catchNotes) {
    //                         if (doc.currentNote.pageIdx >= 0) {
    //                             if (!pushed) {
    //                                 doc.currentNote.note.text.push(elem);
    //                                 pushed = true;
    //                             } else {
    //                                 doc.currentNote.note.text[doc.currentNote.note.text.length - 1] += elem;
    //                             }
    //                             // if (doc.currentNote.note.text.length === 1) {
    //                             //     elem = charOfStyleTag.note_begin;//'[' + doc.currentNote.note.no + ']';
    //                             // } else {
    //                             elem = ''
    //                             draw = false;
    //                             // }
    //                         } else {
    //                             onlyNoteContent = false;
    //                         }
    //                     }
    //                 } else {
    //                     if (!catchNotes) {
    //                         elem = '';
    //                         draw = false;
    //                     }
    //                 }

    //                 if (draw) {

    //                     let font = 'ScriptNormal';
    //                     var fontSize = undefined;
    //                     fontSize = options.fontSize || print.font_size || 12;
    //                     if (doc.format_state.override_color) {
    //                         // 注释中
    //                         fontSize = print.note_font_size;
    //                     }
    //                     var oblique = undefined;
    //                     var stroke = undefined;
    //                     if (doc.format_state.bold_italic) {
    //                         if (opts.found_font_bold_italic) {
    //                             font = 'ScriptBoldOblique';
    //                         } else {
    //                             if (opts.found_font_italic) {
    //                                 font = 'ScriptOblique';
    //                                 stroke = true;
    //                             }
    //                             else if (opts.found_font_bold) {
    //                                 font = 'ScriptBold';
    //                                 oblique = true;
    //                             }
    //                             else {
    //                                 oblique = true;
    //                                 stroke = true;
    //                             }

    //                         }
    //                     } else if (doc.format_state.bold || options.bold) {
    //                         if (opts.found_font_bold) {
    //                             font = 'ScriptBold';
    //                         } else {
    //                             stroke = true;
    //                         }
    //                     } else if (doc.format_state.italic) {
    //                         if (opts.found_font_italic) {
    //                             font = 'ScriptOblique';
    //                         } else {
    //                             oblique = true;
    //                         }
    //                     }
    //                     // if (elem === '\\_' || elem === '\\*') {
    //                     //     elem = elem.substr(1, 1);
    //                     // }
    //                     var linkurl = undefined;
    //                     for (const link of links) {
    //                         if (link.start <= currentIndex && currentIndex < link.start + link.length) {
    //                             linkurl = link.url;
    //                         }
    //                     }
    //                     var coloer2 = doc.format_state.override_color ? doc.format_state.override_color : color

    //                     var tobj = {
    //                         lineBreak: false,
    //                         text: elem,
    //                         link: linkurl,
    //                         font: font,
    //                         underline: linkurl || doc.format_state.underline,
    //                         color: coloer2,
    //                         strokeColor: coloer2,
    //                         oblique: oblique,
    //                         stroke: stroke,
    //                         fontSize: fontSize,
    //                     }

    //                     textobjects.push(tobj);
    //                 }

    //             }
    //         }
    //         currentIndex += elem.length;
    //         /*inner_text.call(doc, elem, x * 72, y * 72, {
    //             underline: doc.format_state.underline,
    //             lineBreak: options.line_break,
    //             width: options.width * 72,
    //             align: options.align
    //         });*/
    //     }

    //     if (textobjects.length === 0 && onlyNoteContent) {
    //         return { height: 0, breaks: 0, switches: 0, lines: [] }
    //     }

    //     var firstBreakHeight = firstBreakHeight * 72;
    //     if (catchNotes) {
    //         firstBreakHeight = firstBreakHeight - (note_lines(pageIdx) * print.font_height * 72);
    //     }

    //     // return addTextbox(textobjects, doc, x * 72, y * 72, width * 72, posTop * 72, firstBreakHeight, breakHeight * 72, switchPageFrom, switchPageTo, onlyGetLines,
    //     //     { // 组件bug,text显示宽度比实际配置的width值要大
    //     //         lineHeight: options.lineHeight || print.font_height * 72,
    //     //         lineBreak: false,
    //     //         align: options.align,
    //     //         baseline: 'bottom',
    //     //         fontSize: options.fontSize || print.font_size || 12,
    //     //     });
    //     // TODO Arming (2024-12-10) : 

    // };

    function splitBy(text: string, delimiter: string) {
        var
            delimiterPATTERN = '(' + delimiter + ')',
            delimiterRE = new RegExp(delimiterPATTERN, 'g');

        return text.split(delimiterRE).reduce(function (chunks, item) {
            if (item.match(delimiterRE)) {
                chunks.push(item)
            } else {
                chunks[chunks.length - 1] += item
            };
            return chunks
        }, [])
    }

    interface image { path: string }
    doc.text2withImages = function (text: string, x: number, y: number, options: any) {
        let textparts = splitBy(text, regex.link.source);
        var parts: { text?: string, image?: image }[] = [];
        for (let i = 0; i < textparts.length; i++) {
            let match = regex.link.exec(textparts[i]);
            if (match.length > 0) {
                parts.push({ image: { path: match[6] } });
                parts.push({ text: textparts[i].slice(match[0].length) })
            }
            else {
                parts.push({ text: textparts[i] });
            }
        }
        var additionalY = 0;
        for (const part of parts) {
            if (part.text) {
                doc.text2(part.text, x, y + additionalY, 0, 0, 0, 0, false, options);
            }
        }
    }

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
    
    Packer.toBuffer(doc).then((buffer) => {
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
        exportcfg = opts.exportconfig;
    var pageIdx = 0;

    var bottom_notes = cfg.note_position_bottom
    console.log(print,lines,exportcfg,pageIdx,bottom_notes,lineStructs);

    var pagesHeight: { [key: number]: number } = {};

    var title_token = get_title_page_token(parsed, 'title');
    var author_token = get_title_page_token(parsed, 'author');
    if (!author_token) {
        author_token = get_title_page_token(parsed, 'authors');
    }
    
    doc.options.creator = author_token ? clearFormatting(inline(author_token.text)) : '';
    doc.options.title =  title_token ? clearFormatting(inline(title_token.text)) : '';
    
    doc.options.sections=[
        {
            properties: {},
            children: [
                new Paragraph({
                    children: [
                        new TextRun("Hello World"),
                        new TextRun({
                            text: "Foo Bar",
                            bold: true,
                            size: 40,
                        }),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun("Hello World 2"),
                        new TextRun({
                            text: "Foo Bar 2",
                            bold: true,
                            size: 40,
                        }),
                    ],
                }),
            ],
        },
        {
            headers: {
                default: new Header({ // The standard default header on every page or header on odd pages when the 'Different Odd & Even Pages' option is activated
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun("My Title "),
                                new TextRun({
                                    children: ["Page ", PageNumber.CURRENT],
                                }),
                            ],
                        }),
                    ],
                }),
            },
            footers: {
                default: new Footer({ // The standard default footer on every page or footer on odd pages when the 'Different Odd & Even Pages' option is activated
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.RIGHT,
                            children: [
                                new TextRun("My Title "),
                                new TextRun({
                                    children: ["Footer - Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
                                }),
                            ],
                        }),
                    ],
                }),
            },
            children: [
                new Paragraph({
                    children: [
                        new TextRun("Hello World 3"),
                        new TextRun({
                            text: "Foo Bar 3",
                            bold: true,
                            size: 40,
                        }),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun("Hello World 4"),
                        new TextRun({
                            text: "Foo Bar 4",
                            bold: true,
                            size: 40,
                        }),
                    ],
                }),
                new Paragraph({
                    pageBreakBefore: true,
                    children: [
                        new TextRun("墨绿色的 5"),
                        new TextRun({
                            text: "手动阀 5",
                            bold: true,
                            size: 40,
                            break: 1,
                        }),
                        new TextRun({
                            text: "手动阀的身份 5",
                            italics: true,
                            size: 40,
                            break: 1,
                        }),
                    ],
                }),
                new Paragraph({
                    children: [
                        new TextRun("Hello World 6"),
                        new TextRun({
                            text: "Foo Bar 6",
                            bold: true,
                            size: 40,
                        }),
                    ],
                }),
            ],
        },
    ];
    
    doc.doc= new Document(doc.options);
    return pagesHeight
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
    pagecount: number,
    pagecountReal: number,
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
    var lines = 0;
    for (var pIdx in ph) {
        var h = ph[pIdx];
        lines += Math.round(h / opts.print.font_height);
    }
    stats.pagecount = lines / opts.print.lines_per_page;
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
    for (var pIdx in ph) {
        var h = ph[pIdx];
        lines += Math.round(h / opts.print.font_height);
    }
    stats.pagecount = lines / opts.print.lines_per_page;
    return {
        data: await Packer.toBase64String(doc.doc),
        stats: stats
    }
}