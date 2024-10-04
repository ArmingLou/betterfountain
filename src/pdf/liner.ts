import { isBlankLineAfterStlyle } from "../utils";

export class Liner {
    printTakeNumbers: boolean = false;
    h: any = {}
    _state = "normal"; // 'dialogue'

    constructor(helper: any, printTakeNumbers: boolean) {
        this.h = helper;
        this.printTakeNumbers = printTakeNumbers;
    }


    split_token3 = (token: any): any => {
        var tmpText;

        if (token.type === "character" && this.printTakeNumbers) {
            tmpText = token.takeNumber + " - " + token.text;
        } else {
            tmpText = token.text ? token.text : "";
        }
        var bl = tmpText.split('\n');
        var res = [];
        var st = token.start;
        for (var i = 0; i < bl.length; i++) {
            var l = bl[i].length;
            res.push(this.h.create_line({
                type: token.type,
                token: token,
                text: bl[i],
                start: st,
                end: st + l - 1,
            }))
            st += l;
        }
        token.lines = res;
        // return res;
    }


    line2 = async (tokens: any, cfg: any): Promise<any> => {
        var lines: any[] = [],
            global_index = 0;
        var lastLineBlank = false;
        tokens.forEach((token: any) => {
            if (!token.hide) {

                //Replace tabs with 4 spaces
                if (token.text) {
                    token.text = token.text.replace('\t', '    ');
                }

                this.split_token3(token);

                if (token.is("scene_heading") && lines.length) {
                    token.lines[0].number = token.number;
                }

                token.lines.forEach((line: any, index: any) => {
                    var pushed = true;
                    if (cfg.merge_empty_lines) {

                        if (token.type === "page_break") {
                            lastLineBlank = false; // 需要保留行
                        } else {
                            var currBlank = isBlankLineAfterStlyle(line.text);
                            if (currBlank && lastLineBlank) {
                                var t = line.text.replace(/\s/g, '').trim(); // 剩下样式符号
                                // 加到上一行
                                lines[lines.length - 1].text += t;
                                pushed = false;
                            }
                            lastLineBlank = currBlank;
                        }
                    }
                    if (pushed) {
                        line.local_index = index;
                        line.global_index = global_index++;
                        lines.push(line);
                    }
                });
            }
        });
        // this.fold_dual_dialogue(lines);
        return lines;
    }


}