import * as vscode from "vscode";
import { parsedDocuments } from "../extension";
import { getCharactersWhoSpokeBeforeLast } from "../utils";
import username = require("username");
import { titlePageDisplay } from "../afterwriting-parser";
var fontnames: any[];
const fontFinder = require('font-finder');
var userfullname: string;

//Load fonts for autocomplete
(async () => {
	var fontlist = await fontFinder.list()
	fontnames = Object.keys(fontlist);
})();

//Get user's full name for author autocomplete
(async () => {
	userfullname = await username();
	if (userfullname.length > 0) {
		userfullname = userfullname.charAt(0).toUpperCase() + userfullname.slice(1)
	}
})();

function TimeofDayCompletion(input: string, addspace: boolean, sort: string): vscode.CompletionItem {
	return {
		label: " - " + input,
		kind: vscode.CompletionItemKind.Constant,
		filterText: "- " + input,
		sortText: sort,
		insertText: (addspace ? " " : "") + input + "\n\n"
	};
}
interface TitlePageKeyComplete {
	name: string,
	sort: string,
	detail: string,
	documentation?: string,
	triggerIntellisense?: boolean,
	deprecated?: boolean,
	position: 'tl' | 'tc' | 'tr' | 'cc' | 'bl' | 'br' | 'hidden' | 'watermark' | 'header' | 'footer'
}
const pagedrawings = {
	tl: `Top Left:
╔══════╗
║▀▀    ║
║      ║
║      ║
╚══════╝`,
	tc: `Top Center:
╔══════╗
║  ▀▀  ║
║      ║
║      ║
╚══════╝`,
	tr: `Top Right:
╔══════╗
║    ▀▀║
║      ║
║      ║
╚══════╝`,
	cc: `Center:
╔══════╗
║      ║
║ ████ ║
║      ║
╚══════╝`,
	bl: `Bottom Left:
╔══════╗
║      ║
║      ║
║███   ║
╚══════╝`,
	br: `Bottom Right:
╔══════╗
║      ║
║      ║
║   ███║
╚══════╝`,
	watermark: `
╔══════╗
║    ⋰ ║
║  ⋰   ║
║⋰     ║
╚══════╝`,
	header: `
╚══════╝
╔══════╗
║▀▀▀▀▀▀║
║      ║`,
	footer: `
║      ║
║▄▄▄▄▄▄║
╚══════╝
╔══════╗`,
	hidden: `
	(Not printed on title page)`};
function TitlePageKey(info: TitlePageKeyComplete): vscode.CompletionItem {
	var documentation = new vscode.MarkdownString(info.documentation);
	if (info.position) {
		documentation.appendCodeblock(pagedrawings[info.position]);
	}
	var complete: vscode.CompletionItem = {
		label: info.name + ": ",
		kind: vscode.CompletionItemKind.Constant,
		filterText: "\n" + info.name,
		sortText: info.sort.toString(),
		detail: info.detail,
		documentation: documentation,
	}
	if (info.triggerIntellisense) complete.command = { command: "editor.action.triggerSuggest", title: "triggersuggest" };
	if (info.deprecated) complete.tags = [1];
	return complete;
}

export class FountainCompletionProvider implements vscode.CompletionItemProvider {

	provideScenCompletionItems(key: string, previousLineIsEmpty: boolean, position: vscode.Position): vscode.CompletionItem[] {
		var completes: vscode.CompletionItem[] = [];
		completes.push({ label: ".(内景) ", range: new vscode.Range(position.translate(0, -key.length), position), filterText: key + '（(内景)）', insertText: previousLineIsEmpty ? '.(内景) ' : '\n.(内景) ', documentation: "内景", sortText: "00B", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
		completes.push({ label: ".(外景) ", range: new vscode.Range(position.translate(0, -key.length), position), filterText: key + '（(外景)）', insertText: previousLineIsEmpty ? '.(外景) ' : '\n.(外景) ', documentation: "外景", sortText: "00C", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
		completes.push({ label: ".(内外景) ", range: new vscode.Range(position.translate(0, -key.length), position), filterText: key + '（(内外景)）', insertText: previousLineIsEmpty ? '.(内外景) ' : '\n.(内外景) ', documentation: "内外景", sortText: "00D", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
		return completes;
	}

	provideTransitionCompletionItems(key: string, previousLineIsEmpty: boolean, position: vscode.Position): vscode.CompletionItem[] {
		var completes: vscode.CompletionItem[] = [];
		completes.push({ label: ">", filterText: key, insertText: previousLineIsEmpty ? '>' : '\n>', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0A" });
		completes.push({ label: ">叠化", filterText: key + '叠化', insertText: previousLineIsEmpty ? '>叠化' : '\n>叠化', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0b" });
		completes.push({ label: ">淡出淡入", filterText: key + '淡出淡入', insertText: previousLineIsEmpty ? '>淡出淡入' : '\n>淡出淡入', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0c" });
		completes.push({ label: ">切到", filterText: key + '切到', insertText: previousLineIsEmpty ? '>切到' : '\n>切到', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0d" });
		completes.push({ label: ">闪回", filterText: key + '闪回', insertText: previousLineIsEmpty ? '>闪回' : '\n>闪回', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0f" });
		completes.push({ label: ">淡出", filterText: key + '淡出', insertText: previousLineIsEmpty ? '>淡出' : '\n>淡出', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0g" });
		completes.push({ label: ">淡入", filterText: key + '淡入', insertText: previousLineIsEmpty ? '>淡入' : '\n>淡入', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0h" });
		completes.push({ label: ">闪回结束", filterText: key + '闪回结束', insertText: previousLineIsEmpty ? '>闪回结束' : '\n>闪回结束', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入转场", sortText: "0i" });
		completes.push({ label: ">{+镜头交切+}", filterText: key + '{+镜头交切+}', insertText: previousLineIsEmpty ? '>{+镜头交切+}' : '\n>{+镜头交切+}', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入镜头交切", sortText: "0j" });
		completes.push({ label: ">{-结束交切-}", filterText: key + '{-结束交切-}', insertText: previousLineIsEmpty ? '>{-结束交切-}' : '\n>{-结束交切-}', range: new vscode.Range(position.translate(0, -1), position), documentation: "插入结束交切", sortText: "0k" });
		completes.push({ label: "> <", filterText: key + '<《〈', insertText: new vscode.SnippetString('>$1<'), range: new vscode.Range(position.translate(0, -1), position), documentation: "插入居中语法", sortText: "1B" });
		return completes;
	}

	provideCharDesCompletionItems(key: string, currentline: string, position: vscode.Position): vscode.CompletionItem[] {
		var completes: vscode.CompletionItem[] = [];
		// 判断角色，补全 画中画，旁白 的自动补全。
		var scenematch = currentline.match(/^[ \t]*(((?!@)\p{Lu}[^\p{Ll}\r\n]*)|(@[^\r\n\(（\^]*))[\(（](\s*\^)?\s*$/gu);
		if (scenematch) {
			var preSpace = '';
			if (currentline.substring(position.character - 2, position.character - 1) == ' ') {
				if (currentline.substring(position.character - 3, position.character - 2) !== ' ') {
					preSpace = ' ';
				}
			} else {
				preSpace = '  ';
			}
			completes.push({ label: "(画外音)", range: new vscode.Range(position.translate(0, -1), position), filterText: key + '画外音)）', insertText: preSpace + '(画外音)', documentation: "画外音", sortText: "0A" });
			completes.push({ label: "(旁白)", range: new vscode.Range(position.translate(0, -1), position), filterText: key + '旁白)）', insertText: preSpace + '(旁白)', documentation: "旁白", sortText: "1A" });
			completes.push({ label: "(O. S.)", range: new vscode.Range(position.translate(0, -1), position), filterText: key + 'O. S.)）', insertText: preSpace + '(O. S.)', documentation: "画外音", sortText: "1B" });
			completes.push({ label: "(V. O.)", range: new vscode.Range(position.translate(0, -1), position), filterText: key + 'V. O.)）', insertText: preSpace + '(V. O.)', documentation: "旁白", sortText: "1B" });
			completes.push({ label: "()", range: new vscode.Range(position.translate(0, -1), position), filterText: key + ')）', insertText: new vscode.SnippetString(preSpace + '($1)'), documentation: "添加对话说明", sortText: "3B" });
		}
		return completes;
	}

	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position,/* token: CancellationToken, context: CompletionContext*/): vscode.CompletionItem[] {
		var parsedDocument = parsedDocuments.get(document.uri.toString());
		var completes: vscode.CompletionItem[] = [];
		// var currentline = document.getText(new vscode.Range(new vscode.Position(position.line, 0), position));
		// var currentline = document.getText(new vscode.Range(new vscode.Position(position.line, 0), document.lineAt(position).range.end));
		var currentline = document.lineAt(position).text;
		var currentlineTrim = currentline.trim();
		var prevLine = document.lineAt(position.line - 1).text;
		const hasCharacters = parsedDocument.properties.characters.size > 0;
		// const previousLineIsEmpty = prevLine === "" || prevLine === " ";
		const previousLineIsEmpty = prevLine.trim() === "";

		// 固定加入 中文括号转换 提示：
		// if (currentline.endsWith('（') && position.character == currentline.length) {
		// 	completes.push({ label: "() 转英文括号", range: new vscode.Range(position.translate(0, -1), position), filterText: '（', insertText: new vscode.SnippetString('($1)'), documentation: "转英文括号", sortText: "0A" });
		// } else if (currentline.endsWith('——')) {
		// 	completes.push({ label: "_ _   插入下划线语法", range: new vscode.Range(position.translate(0, -2), position), filterText: '——', insertText: new vscode.SnippetString('_$1_'), documentation: "插入下划线语法", sortText: "0A" });
		// }

		//任何地方输入都提示:



		//Title page autocomplete
		if (parsedDocument.properties.firstTokenLine >= position.line) {
			if (currentlineTrim === "") {
				if (parsedDocument.properties.titleKeys.indexOf("title") == -1)
					// completes.push({ label: "Title: **《》**", insertText: new vscode.SnippetString('Title: **《$1》**'), sortText: "0A", kind: vscode.CompletionItemKind.Snippet });
					completes.push(TitlePageKey({ name: "Title", detail: "The title of the screenplay", sort: "0A", triggerIntellisense: true, position: titlePageDisplay['title'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("credit") == -1)
					completes.push(TitlePageKey({ name: "Credit", detail: "How the author is credited", triggerIntellisense: true, documentation: 'Inserted between the title and the author. Good practice is to simply use "Written by" (avoid "Created by" etc...).', sort: "0B", position: titlePageDisplay['credit'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("author") == -1)
					completes.push(TitlePageKey({ name: "Author", detail: "The name of the author", sort: "0C", triggerIntellisense: true, documentation: "This is you! If there are several authors, you can optionally use the 'authors' tag instead.", position: titlePageDisplay['author'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("source") == -1)
					completes.push(TitlePageKey({ name: "Source", detail: "An additional source for the screenplay", triggerIntellisense: true, documentation: "This will be inserted below the author, and is useful if the story has an additional source (such as 'Original story by x', 'Based on the novel by x', etc...)", sort: "0D", position: titlePageDisplay['source'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("notes") == -1)
					completes.push(TitlePageKey({ name: "Notes", detail: "Additional notes", sort: "0E", documentation: 'Any additional notes you wish to include in the title page', position: titlePageDisplay['notes'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("draft_date") == -1)
					completes.push(TitlePageKey({ name: "Draft Date", detail: "The date of the current draft", triggerIntellisense: true, documentation: 'Useful if you have several drafts and need to keep track of when they were written', sort: "0F", position: titlePageDisplay['draft_date'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("date") == -1)
					completes.push(TitlePageKey({ name: "Date", detail: "The date of the screenplay", triggerIntellisense: true, documentation: 'Only include the date it if necessary for production purposes. Someone reading your screenplay does not generally need to know when it was written.', sort: "0G", position: titlePageDisplay['date'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("contact") == -1 || parsedDocument.properties.titleKeys.indexOf("contact_info") == -1)
					completes.push(TitlePageKey({ name: "Contact", detail: "Contact details", sort: "0H", documentation: 'Your contact details (Address, email, etc...)', position: titlePageDisplay['contact'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("copyright") == -1)
					completes.push(TitlePageKey({ name: "Copyright", detail: "Copyright information", triggerIntellisense: true, documentation: "**Warning:** Including copyright information tends to be unecessary, and may even seem unprofessional in some cases.", sort: "0I", deprecated: true, position: titlePageDisplay['copyright'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("watermark") == -1)
					completes.push(TitlePageKey({ name: "Watermark", detail: "A watermark displayed on every page", documentation: 'A watermark displayed diagonally on every single page', sort: "0J", position: 'watermark' }));
				if (parsedDocument.properties.titleKeys.indexOf("font") == -1)
					completes.push(TitlePageKey({ name: "Font", detail: "The font used in the screenplay", triggerIntellisense: true, documentation: `Generally a monospace courier-type font. BetterFountain's default is [Courier Prime](https://quoteunquoteapps.com/courierprime/), with added support for cyrillic.`, sort: "0K0", position: titlePageDisplay['font'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("font_italic") == -1)
					completes.push(TitlePageKey({ name: "Font Italic", detail: "The italic font used in the screenplay", triggerIntellisense: true, documentation: `Generally a monospace courier-type font. BetterFountain's default is [Courier Prime](https://quoteunquoteapps.com/courierprime/), with added support for cyrillic.`, sort: "0K1", position: titlePageDisplay['font_italic'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("font_bold") == -1)
					completes.push(TitlePageKey({ name: "Font Bold", detail: "The bold font used in the screenplay", triggerIntellisense: true, documentation: `Generally a monospace courier-type font. BetterFountain's default is [Courier Prime](https://quoteunquoteapps.com/courierprime/), with added support for cyrillic.`, sort: "0K2", position: titlePageDisplay['font_bold'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("font_bold_italic") == -1)
					completes.push(TitlePageKey({ name: "Font Bold Italic", detail: "The bold_italic font used in the screenplay", triggerIntellisense: true, documentation: `Generally a monospace courier-type font. BetterFountain's default is [Courier Prime](https://quoteunquoteapps.com/courierprime/), with added support for cyrillic.`, sort: "0K3", position: titlePageDisplay['font_bold_italic'].position }));
				if (parsedDocument.properties.titleKeys.indexOf("metadata") == -1)
					completes.push(TitlePageKey({
						name: "Metadata", detail: "Metadata json string", triggerIntellisense: true, documentation: `
{
    "userPassword":"",
    "ownerPassword":"",
    "permissions":{
        "printing":false,
        "modifying":false,
        "copying":false,
        "annotating":false,
        "fillingForms":false,
        "contentAccessibility":false,
        "documentAssembly":false
    },
	"chars_per_minu": 243.22,
	"dial_chars_per_minu": 171,
	"chinaFormat": 0,
	"embedFonts": false,
	"print": {
		"paper_size": "a4",
		"font_size": 12,
		"character_spacing": 1,
		"note_font_size": 9,
		"lines_per_page": 30,
		"top_margin": 1.19,
		"bottom_margin": 1,
		"page_width": 8.27,
		"page_height": 11.69,
		"left_margin": 1.5,
		"right_margin": 1.5,
		"font_width": 0.1,
		"note_line_height": 0.17,
		"page_number_top_margin": 0.4
	}
}

[chars_per_minu] - 每分钟多少字符（针对全文，不区分对白），用于粗略预估剧本时间【主要用于其他客户端软件使用】。

[dial_chars_per_minu] - 对白每分钟多少字符，用于粗略预估对白时间【主要用于其他客户端软件使用】。

[chinaFormat] - print in china format (dialogue is aligned to the left). 0: don't print in china format; 1: print in china format with △; 2: china format without △ .

[embedFonts] - If embed fonts. (available in docx only)

[userPassword] - the user password (string value)

To enable encryption, provide a user password when creating the PDFDocument in options object. The PDF file will be encrypted when a user password is provided, and users will be prompted to enter the password to decrypt the file when opening it.


[ownerPassword] - the owner password (string value)

[permissions] - the object specifying PDF file permissions

To set access privileges for the PDF file, you need to provide an owner password and permission settings in the option object when creating PDFDocument. By default, all operations are disallowed. You need to explicitly allow certain operations.


Following settings are allowed in permissions object:

[printing] - whether printing is allowed. Specify "lowResolution" to allow degraded printing, or "highResolution" to allow printing with high resolution

[modifying] - whether modifying the file is allowed. Specify true to allow modifying document content

[copying] - whether copying text or graphics is allowed. Specify true to allow copying

[annotating] - whether annotating, form filling is allowed. Specify true to allow annotating and form filling

[fillingForms] - whether form filling and signing is allowed. Specify true to allow filling in form fields and signing

[contentAccessibility] - whether copying text for accessibility is allowed. Specify true to allow copying for accessibility

[documentAssembly] - whether assembling document is allowed. Specify true to allow document assembly


You can specify either [userPassword], [ownerPassword] or both passwords. Behavior differs according to passwords you provides:

When only [userPassword] is provided, users with user password are able to decrypt the file and have full access to the document.
When only [ownerPassword] is provided, users are able to decrypt and open the document without providing any password, but the access is limited to those operations explicitly permitted. Users with owner password have full access to the document.
When both passwords are provided, users with user password are able to decrypt the file but only have limited access to the file according to permission settings. Users with owner password have full access to the document.`, sort: "0K4", position: titlePageDisplay['metadata'].position
					}));
				if (parsedDocument.properties.titleKeys.indexOf("revision") == -1)
					completes.push(TitlePageKey({
						name: "Revision", detail: "The name of the current and past revisions", documentation: `New revisions are generally printed on different-colored paper, and named accordingly. The WGA order for revisions is:
* White Draft (original)
* Blue Revision
* Pink Revision
* Yellow Revision
* Green Revision
* Goldenrod Revision
* Buff Revision
* Salmon Revision
* Cherry Revision
* Second Blue Revision
* Second Pink Revision
* Second Yellow Revision
* Second Green Revision
* Second Goldenrod Revision
* Second Buff Revision
* Second Salmon Revision
* Second Cherry Revision`, sort: "0L", position: titlePageDisplay['revision'].position
					}));
				completes.push(TitlePageKey({ name: "TL", detail: "Top Left", documentation: "Additional content in the top left of the title page", sort: "0M", position: titlePageDisplay['tl'].position }));
				completes.push(TitlePageKey({ name: "TC", detail: "Top Center", documentation: "Additional content in the top center of the title page", sort: "0N", position: titlePageDisplay['tc'].position }));
				completes.push(TitlePageKey({ name: "TR", detail: "Top Right", documentation: "Additional content in the top right of the title page", sort: "0O", position: titlePageDisplay['tr'].position }));
				completes.push(TitlePageKey({ name: "CC", detail: "Center Center", documentation: "Additional content in the center of the title page", sort: "0P", position: titlePageDisplay['cc'].position }));
				completes.push(TitlePageKey({ name: "BL", detail: "Bottom Left", documentation: "Additional content in the bottom left of the title page", sort: "0Q", position: titlePageDisplay['bl'].position }));
				completes.push(TitlePageKey({ name: "BR", detail: "Bottom Right", documentation: "Additional content in the bottom right of the title page", sort: "0R", position: titlePageDisplay['br'].position }));
				completes.push(TitlePageKey({ name: 'Header', detail: "Header used throughout the document", documentation: "This will be printed in the top left of every single page, excluding the title page. Can also be set globally by the 'Page Header' setting", sort: "S", position: 'header' }));
				completes.push(TitlePageKey({ name: 'Footer', detail: "Header used throughout the document", documentation: "This will be printed in the bottom left of every single page, excluding the title page. Can also be set globally by the 'Page Footer' setting", sort: "T", position: 'footer' }));
			}
			else {
				var currentkey = currentlineTrim.toLowerCase();
				if (currentkey == 'title:') {
					completes.push({ label: "**《》**", insertText: new vscode.SnippetString('**《$1》**'), sortText: "0A", kind: vscode.CompletionItemKind.Snippet });
				}
				else if (currentkey == "date:" || currentkey == "draft date:") {
					var datestring1 = new Date().toLocaleDateString('zh-Hans-CN');
					var datestring2 = new Date().toDateString();
					completes.push({ label: datestring1, insertText: datestring1 + "\n", kind: vscode.CompletionItemKind.Text, sortText: "0A", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
					completes.push({ label: datestring2, insertText: datestring2 + "\n", kind: vscode.CompletionItemKind.Text, sortText: "0B", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
				}
				else if (currentkey == "author:" || currentkey == "author") {
					completes.push({ label: userfullname, insertText: userfullname, kind: vscode.CompletionItemKind.Text });
				}
				else if (currentkey == "credit:") {
					completes.push({ label: "作者", insertText: "作者\n", sortText: "0A", kind: vscode.CompletionItemKind.Text, command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
					completes.push({ label: "By", insertText: "By\n", sortText: "0B", kind: vscode.CompletionItemKind.Text, command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
					completes.push({ label: "Written by", insertText: "Written by\n", sortText: "0C", kind: vscode.CompletionItemKind.Text, command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
				}
				else if (currentkey == "source:") {
					completes.push({ label: "改编自", sortText: "0A", kind: vscode.CompletionItemKind.Text });
					completes.push({ label: "Story by ", sortText: "0B", kind: vscode.CompletionItemKind.Text });
					completes.push({ label: "Based on ", sortText: "0C", kind: vscode.CompletionItemKind.Text });
				}
				else if (currentkey == "copyright:") {
					completes.push({ label: "(c)" + new Date().getFullYear() + " ", sortText: "0A", kind: vscode.CompletionItemKind.Text });
				}
				else if (currentkey == "font:" || currentkey == "font italic:" || currentkey == "font bold:" || currentkey == "font bold italic:") {
					fontnames.forEach((fontname: string) => {
						completes.push({ label: fontname, insertText: fontname + "\n", kind: vscode.CompletionItemKind.Text });
					})
				}
				else if (currentkey == "metadata:") {
					completes.push({
						label: `{
    "userPassword":"",
    "ownerPassword":"",
    "permissions":{
        "printing":false,
        "modifying":false,
        "copying":false,
        "annotating":false,
        "fillingForms":false,
        "contentAccessibility":false,
        "documentAssembly":false
    },
	"chars_per_minu": 243.22,
	"dial_chars_per_minu": 171,
	"chinaFormat": 0,
	"embedFonts": false,
	"print": {
		"paper_size": "a4",
		"font_size": 12,
		"character_spacing": 1,
		"note_font_size": 9,
		"lines_per_page": 30,
		"top_margin": 1.19,
		"bottom_margin": 1,
		"page_width": 8.27,
		"page_height": 11.69,
		"left_margin": 1.5,
		"right_margin": 1.5,
		"font_width": 0.1,
		"note_line_height": 0.17,
		"page_number_top_margin": 0.4
	}
}`, sortText: "0A", kind: vscode.CompletionItemKind.Text
					});
				}
			}
		}
		//Other autocompletes
		else if (currentlineTrim === '@' && currentline.indexOf("@") == position.character - 1) {
			completes.push({ label: '@', range: new vscode.Range(position.translate(0, -1), position), filterText: '@', insertText: previousLineIsEmpty ? '@' : '\n@', kind: vscode.CompletionItemKind.Keyword, sortText: "000" + index, documentation: "Character from the current scene" });
			//We aren't on the first line, and the previous line is empty

			//Get current scene number
			/*var this_scene_nb = -1;
			for (let index in fountainDocProps.scenes) {
				if (fountainDocProps.scenes[index].line < position.line)
					this_scene_nb = fountainDocProps.scenes[index].scene
				else
					break;
			}*/
			let charactersWhoSpokeBeforeLast = undefined;
			let charactersFromCurrentSceneHash = new Set();
			if (hasCharacters) {
				// The characters who spoke before the last one, within the current scene
				charactersWhoSpokeBeforeLast = getCharactersWhoSpokeBeforeLast(parsedDocument, position);
				if (charactersWhoSpokeBeforeLast.length > 0) {
					var index = 0;
					charactersWhoSpokeBeforeLast.forEach(character => {
						// var charWithForceSymbolIfNecessary = addForceSymbolToCharacter(character);
						// var charWithForceSymbolIfNecessary = currentlineTrim === '@' ? character : '@' + character;
						var it = previousLineIsEmpty ? '@' + character : '\n@' + character;
						charactersFromCurrentSceneHash.add(character);
						completes.push({ label: '@' + character, range: new vscode.Range(position.translate(0, -1), position), filterText: '@' + character, insertText: it, kind: vscode.CompletionItemKind.Keyword, sortText: "0A" + index, documentation: "Character from the current scene", command: { command: "type", arguments: [{ "text": "\n" }], title: "newline" } });
						index++;
					});
				}
				else {
					charactersWhoSpokeBeforeLast = undefined;
				}
			}

			// if (currentlineTrim !== '@') {
			// 	completes.push({ label: ".(内景) ", documentation: "内景", sortText: "1B", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: ".(外景) ", documentation: "外景", sortText: "1C", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: ".(内外景) ", documentation: "内外景", sortText: "1D", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: "INT. ", documentation: "Interior", sortText: "1E", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: "EXT. ", documentation: "Exterior", sortText: "1F", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: "INT/EXT. ", documentation: "Interior/Exterior", sortText: "1G", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// 	completes.push({ label: "EST. ", documentation: "Establishing", sortText: "1H", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			// }
			if (hasCharacters) {
				let sortText = "2" // Add all characters, but after the "INT/EXT" suggestions
				if (charactersWhoSpokeBeforeLast == undefined) {
					sortText = "0A"; //There's no characters in the current scene, suggest characters before INT/EXT
				}
				parsedDocument.properties.characters.forEach((_value: number[], key: string) => {
					if (!charactersFromCurrentSceneHash.has(key) && key.trim() !== '') {
						// var charWithForceSymbolIfNecessary = currentlineTrim === '@' ? key : '@' + key;
						var it = previousLineIsEmpty ? '@' + key : '\n@' + key;
						completes.push({ label: '@' + key, range: new vscode.Range(position.translate(0, -1), position), filterText: '@' + key, insertText: it, documentation: "Character", sortText: sortText, kind: vscode.CompletionItemKind.Text, command: { command: "type", arguments: [{ "text": "\n" }], title: "newline" } });
					}
				});
			}
		}
		// else  // 转场和 第一个场景，可以在title page 提示
		if (currentlineTrim === "." || currentlineTrim === "。" || currentlineTrim === ".(" || currentlineTrim === "。(") {
			if (currentline.indexOf(currentlineTrim) == position.character - currentlineTrim.length) {
				var its = this.provideScenCompletionItems(currentlineTrim, previousLineIsEmpty, position);
				completes.push(...its)
			}
		}
		else if (currentlineTrim === "》" || currentlineTrim === "〉" || currentlineTrim === ">") {
			if (currentline.indexOf(currentlineTrim) == position.character - 1) {
				var its = this.provideTransitionCompletionItems(currentlineTrim, previousLineIsEmpty, position);
				completes.push(...its)
			}
		}
		else if (currentlineTrim === "e" || currentlineTrim === "E") {
			if (currentline.indexOf(currentlineTrim) == position.character - 1) {
				completes.push({ label: "EXT. ", range: new vscode.Range(position.translate(0, -1), position), filterText: 'EXT.', insertText: previousLineIsEmpty ? 'EXT. ' : '\nEXT. ', documentation: "Exterior", sortText: "001F", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
				completes.push({ label: "INT/EXT. ", range: new vscode.Range(position.translate(0, -1), position), filterText: 'INT/EXT.', insertText: previousLineIsEmpty ? 'INT/EXT. ' : '\nINT/EXT. ', documentation: "Interior/Exterior", sortText: "001h", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
				completes.push({ label: "EST. ", range: new vscode.Range(position.translate(0, -1), position), filterText: 'EST.', insertText: previousLineIsEmpty ? 'EST. ' : '\nEST. ', documentation: "Establishing", sortText: "001i", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			}
		}
		else if (currentlineTrim === "i" || currentlineTrim === "I") {
			if (currentline.indexOf(currentlineTrim) == position.character - 1) {
				completes.push({ label: "INT. ", range: new vscode.Range(position.translate(0, -1), position), filterText: 'INT.', insertText: previousLineIsEmpty ? 'INT. ' : '\nINT. ', documentation: "Interior", sortText: "001F", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
				completes.push({ label: "INT/EXT. ", range: new vscode.Range(position.translate(0, -1), position), filterText: 'INT/EXT.', insertText: previousLineIsEmpty ? 'INT/EXT. ' : '\nINT/EXT. ', documentation: "Interior/Exterior", sortText: "001h", command: { command: "editor.action.triggerSuggest", title: "triggersuggest" } });
			}
		}
		// else if (currentlineTrim === "（") {
		// 	if (currentline.indexOf("（") == position.character - 1) {
		// 		completes.push({ label: "( 转英文标点", filterText: '（',insertText: new vscode.SnippetString('($1)'), documentation: "转英文标点", sortText: "0A"});
		// 	}
		// }

		//Scene header autocomplete
		if (parsedDocument.properties.sceneLines.indexOf(position.line) > -1) {
			//Time of day
			var mt = currentline.match(/^[^-–—−]+?[-–—−]\s*$/g);
			if (mt) {
				var addspace = !currentline.endsWith(" ");
				completes.push(TimeofDayCompletion("日", addspace, "A"));
				completes.push(TimeofDayCompletion("夜", addspace, "B"));
				completes.push(TimeofDayCompletion("傍晚", addspace, "C"));
				completes.push(TimeofDayCompletion("清晨", addspace, "D1"));
				completes.push(TimeofDayCompletion("黎明", addspace, "D2"));
				completes.push(TimeofDayCompletion("DAY", addspace, "E"));
				completes.push(TimeofDayCompletion("NIGHT", addspace, "F"));
				completes.push(TimeofDayCompletion("DUSK", addspace, "G"));
				completes.push(TimeofDayCompletion("DAWN", addspace, "H"));
				completes.push(TimeofDayCompletion("MORNING", addspace, "I"));
			}
			else {
				// var scenematch = currentline.match(/^[ \t]*((?:\*{0,3}_?)?(?:int|ext|est|int\.?\/ext|i\.?\/e)?\.(\(内景\)|\(外景\))?)\s*$/gi);
				// var scenematch = currentline.match(/^[ \t]*([.](?=[\w\(（\p{L}])(\(内景\)|\(外景\)|\(内外景\)|（内景）|（外景）|（内外景）)?|(?:int|ext|est|int[.]?\/ext|i[.]?\/e)[.\s])\s*([^-–—−]+\/\s*)?$/gui);
				var scenematch = currentline.match(/^[ \t]*([.](?=[\w\(（\p{L}])(\(内景\)|\(外景\)|\(内外景\)|（内景）|（外景）|（内外景）)?|(?:int|ext|est|int[.]?\/ext|i[.]?\/e)[.\s])\s*$/gui); // 去掉用斜杠区分多个地点的逻辑，优化了镜头交切的 语法。
				if (scenematch) {

					// var previousLabels: string[] = []
					parsedDocument.properties.locations.forEach((_location, name) => {
						if (name != "") {
							// if (previousLabels.indexOf(name) == -1) {
							// 	previousLabels.push(name);
							completes.push({ label: name, documentation: "Scene heading", sortText: "0B" + name });
							// }

						}
					})

					// for (let index = 0; index < parsedDocument.properties.sceneNames.length; index++) {
					// 	var spacepos = parsedDocument.properties.sceneNames[index].indexOf(" ");
					// 	if (spacepos != -1) {
					// 		var thisLocation = parsedDocument.properties.sceneNames[index].slice(parsedDocument.properties.sceneNames[index].indexOf(" ")).trimLeft();
					// 		if (previousLabels.indexOf(thisLocation) == -1) {
					// 			previousLabels.push(thisLocation);
					// 			if (parsedDocument.properties.sceneNames[index].toLowerCase().startsWith(scenematch[0].toLowerCase())) {
					// 				completes.push({ label: thisLocation, documentation: "Scene heading", sortText: "0A" + (10 - scenematch[0].length) });
					// 				//The (10-scenematch[0].length) is a hack to avoid a situation where INT. would be before INT./EXT. when it should be after
					// 			}
					// 			else
					// 				completes.push({ label: thisLocation, documentation: "Scene heading", sortText: "0B" });
					// 		}
					// 	}
					// }
				}
			}
		}

		if (currentline.substring(position.character - 1, position.character) == '【') {
			completes.push({ label: "[[ ]] 插入note", range: new vscode.Range(position.translate(0, -1), position), filterText: '【【】】', insertText: new vscode.SnippetString('[[$1]]'), documentation: "插入note", sortText: "0B" });
		} else if (currentline.substring(position.character - 1, position.character) == '（') {
			// 判断角色，补全 画中画，旁白 的自动补全。
			var its = this.provideCharDesCompletionItems('（', currentline, position);
			if (its.length) {
				completes.push(...its)
			} else {
				if (position.character < currentline.trimRight().length) {
					//只有中间插入的位置提示提示：
					completes.push({ label: "(  转为英文括号", range: new vscode.Range(position.translate(0, -1), position), filterText: '（', insertText: '(', documentation: "转为英文括号", sortText: "2B" });
				}
				completes.push({ label: "() 插入英文括号", range: new vscode.Range(position.translate(0, -1), position), filterText: '（）', insertText: new vscode.SnippetString('($1)'), documentation: "插入英文括号", sortText: "3B" });
			}

		} else if (currentline.substring(position.character - 1, position.character) == '(' && currentlineTrim !== '.(' && currentlineTrim !== '。(') {
			// 判断角色，补全 画中画，旁白 的自动补全。
			var its = this.provideCharDesCompletionItems('(', currentline, position);
			if (its.length) {
				completes.push(...its)
			} else {
				completes.push({ label: "()", range: new vscode.Range(position.translate(0, -1), position), filterText: '()', insertText: new vscode.SnippetString('($1)'), documentation: "插入英文括号", sortText: "2B" });
			}

		} else if (currentline.substring(position.character - 2, position.character) == '——') {
			if (position.character < currentline.trimRight().length) {
				//只有中间插入的位置提示提示：
				completes.push({ label: "_     转为下划线", range: new vscode.Range(position.translate(0, -2), position), filterText: '——', insertText: '_', documentation: "转为下划线", sortText: "0A" });
			}
			completes.push({ label: "_ _   插入下划线语法", range: new vscode.Range(position.translate(0, -2), position), filterText: '——', insertText: new vscode.SnippetString('_$1_'), documentation: "插入下划线语法", sortText: "0B" });
		} else if (currentline.substring(position.character - 1, position.character) == '）' && currentline.substring(position.character - 2, position.character - 1) != '（') {
			completes.push({ label: ")  转为英文括号", range: new vscode.Range(position.translate(0, -1), position), filterText: '）', insertText: ')', documentation: "转为英文括号", sortText: "4C" });
		} else if (currentline.substring(position.character - 2, position.character) == '……') {
			if (position.character == currentline.trimRight().length) {
				//只有末尾位置提示提示：
				completes.push({ label: "^  转为英文符号", range: new vscode.Range(position.translate(0, -2), position), filterText: '……', insertText: '^', documentation: "转为英文符号 ^", sortText: "0A" });
			}
		} else if (currentline.substring(position.character - 3, position.character) == '。。。') {
			completes.push({ label: "……  转为省略号", range: new vscode.Range(position.translate(0, -3), position), filterText: '。。。', insertText: '……', documentation: "转为省略号", sortText: "0A" });
		}

		return completes;
	}
}