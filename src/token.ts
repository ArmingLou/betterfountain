export function create_token(text?: string, cursor?: number, line?: number, new_line_length?: number, type?:string){
    var t:token={
        textNoNotes:undefined,
        text:text,
        type:type,
        start:cursor,
        end:cursor,
        line:line,
        ignore:false,
        number:undefined,
        dual:undefined,
        html:undefined,
        level:undefined,
        time:undefined,
        character:undefined,
        index:-1,
        takeNumber:-1,
        is:function(...args:string[]){
            return args.indexOf(this.type) !== -1;
        },
        is_dialogue:function() {
            return this.is("character", "parenthetical", "dialogue");
        },
        name:function(){
            var character = this.text;
            if(this.character){
                character = this.character;
            }
            var p = character.indexOf("(");
            if (p !== -1) {
                character = character.substring(0, p);
            }
            character = character.trim();
            return character;
        },
        location:function() {
            var location = this.text.trim();
            location = location.replace(/^(INT\.?\/EXT\.?)|(I\/E)|(INT\.?)|(EXT\.?)/, "");
            var dash = location.lastIndexOf(" - ");
            if (dash !== -1) {
                location = location.substring(0, dash);
            }
            return location.trim();
        },
        has_scene_time:function(time:any) {
            var suffix = this.text.substring(this.text.indexOf(" - "));
            return this.is("scene_heading") && suffix.indexOf(time) !== -1;
        },
        location_type:function(){
            var location = this.text.trim();
            if (/^I(NT.?)?\/E(XT.?)?/.test(location)) {
                return "mixed";
            }
            else if (/^INT.?/.test(location)) {
                return "int";
            }
            else if (/^EXT.?/.test(location)) {
                return "ext";
            }
            return "other";
        }
    }
    if(text) t.end=cursor + text.length - 1 + new_line_length;
    return t;
}
export interface token {
    textNoNotes:string; //不包含note的text,且格式化特殊字符转换前的text
    text:string; //显示的text，可能包含note内容，以及格式化特殊字符
    type:string;
    start:number;
    end:number;
    line:number;
    number:string;
    dual:string;
    html:string;
    level:number;
    time:number;
    takeNumber:number;
    is:Function;
    is_dialogue:Function;
    name:Function;
    location:Function;
    has_scene_time:Function;
    location_type:Function;
    character:string;
    ignore:boolean;
    index:number;
}