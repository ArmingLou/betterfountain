
export const charOfStyleTag: { [index: string]: string } = {
    dial_cache_break: "⛡",
    note_begin_ext: "இ",
    note_begin: "↺",
    note_end: "↻",
    italic: "☈",
    bold: "↭",
    bold_italic: "↯",
    underline: "☄",
    italic_underline: "⇀",
    bold_underline: "☍",
    bold_italic_underline: "☋",
    link: "𓆡",
    style_left_stash: "↷",
    style_left_pop: "↶",
    style_right_stash: "↝",
    style_right_pop: "↜",
    style_global_stash: "↬",
    style_global_pop: "↫",
    style_global_clean: "⇜",
    italic_global_begin: "↾",
    italic_global_end: "↿",
    all: "☄☈↭↯↺↻↬↫☍☋↷↶↾↿↝↜⇀𓆡⇜இ⛡",
}

export const blockRegex: { [index: string]: RegExp } = {
    block_dialogue_begin: /^[ \t]*(((?!@)\p{Lu}[^\p{Ll}\r\n]*)|(@[^\r\n\(（\^]*))(\(.*\)|（.*）)?(\s*\^)?\s*$/gu,
    block_except_dialogue_begin: /^(?=\s*[^\s]+.*$)/g,
    block_end: /^\s*$/g,
    line_break: /^\s{2,}$/g,
    action_force: /^(\s*)(\!)(.*)/,
    lyric: /^(\s*)(\~)(\s*)(.*)/,
}


export const tokenRegex: { [index: string]: RegExp } = {
    note_inline: /(?:↺|இ)([\s\S]+?)(?:↻)/g,
    underline: /(☄(?=.+☄))(.+?)(☄)/g,
    italic: /(☈(?=.+☈))(.+?)(☈)/g,
    italic_global: /(↾)([^↿]*)(↿)/g,
    bold: /(↭(?=.+↭))(.+?)(↭)/g,
    bold_italic: /(↯(?=.+↯))(.+?)(↯)/g,
    italic_underline: /(?:☄☈(?=.+☈☄)|☈☄(?=.+☄☈))(.+?)(☈☄|☄☈)/g,
    bold_italic_underline: /(☄↯(?=.+↯☄)|↯☄(?=.+☄↯))(.+?)(↯☄|☄↯)/g,
    bold_underline: /(☄↭(?=.+↭☄)|↭☄(?=.+☄↭))(.+?)(↭☄|☄↭)/g,
}

// 不能使用 注解 和 note,以及 样式 的位置： secen头行，character头行，session行, transaction行, title page 标签属性名之前位置, 分页符号===本行。
// 这些位置一旦 使用了 注解或者 note 或样式标记。整行就会转变性质，变成action属性； 
// 或者 未转变性质， 但注解，样式都不起作用，所使用的语法符号直接显示为文本。（主要是 session行, transaction行,）