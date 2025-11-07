import { parsedDocuments } from "../extension";
import { secondsToMinutesString } from "../utils";
import * as vscode from "vscode";
import * as afterparser from "../afterwriting-parser";

export class FountainSymbolProvider implements vscode.DocumentSymbolProvider {
	provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {

		var symbols: vscode.DocumentSymbol[] = []
		// var scenecounter = 0;
		const lastDocumentLine = Math.max(document.lineCount - 1, 0);

		function symbolFromStruct(token: afterparser.StructToken, nexttoken: afterparser.StructToken): { symbol: vscode.DocumentSymbol, length: number } {
			var returnvalue: { symbol: vscode.DocumentSymbol, length: number } = { symbol: undefined, length: 0 };
			var start = token.range.start;
			var _nextTokenLine: number = 0;
			if (token.ischartor) {
				_nextTokenLine = token.dialogueEndLine + 1;
			}

			if (nexttoken && !token.ischartor) {
				_nextTokenLine = nexttoken.range.start.line;
			}

			var end: vscode.Position;
			var details = undefined;
			if (_nextTokenLine <= start.line || _nextTokenLine > lastDocumentLine) {
				end = document.lineAt(lastDocumentLine).range.end;
			} else {
				// end = new vscode.Position(_nextTokenLine, 0);
				end = document.lineAt(_nextTokenLine - 1).range.end;
			}

			if (token.isscene || token.ischartor) {
				// var sceneLength = parsedDocuments.get(document.uri.toString()).properties.scenes[scenecounter].actionLength + parsedDocuments.get(document.uri.toString()).properties.scenes[scenecounter].dialogueLength;
				// details = secondsToMinutesString(sceneLength);
				details = secondsToMinutesString(token.durationSec);
				returnvalue.length = token.durationSec ? token.durationSec : 0;
				// scenecounter++;
			}
			var symbolname = " ";
			if (token.text != "")
				symbolname = token.text;
			var symbol = new vscode.DocumentSymbol(symbolname, details, vscode.SymbolKind.String, new vscode.Range(start, end), token.range);
			symbol.children = [];

			var childrenLength = 0;
			if (token.children != undefined) {
				for (let index = 0; index < token.children.length; index++) {
					var childsymbol = symbolFromStruct(token.children[index], index == token.children.length - 1 ? nexttoken : token.children[index + 1]);
					symbol.children.push(childsymbol.symbol);
					childrenLength += childsymbol.length;
				}
			}
			if (token.section) {
				returnvalue.length = childrenLength;
				symbol.detail = secondsToMinutesString(childrenLength);
			}
			returnvalue.symbol = symbol;
			return returnvalue;
		}

		let doc = parsedDocuments.get(document.uri.toString());
		if (doc) {
			for (let index = 0; index < doc.properties.structure.length; index++) {
				if (!doc.properties.structure[index].isnote) {
					var next = doc.properties.structure[index + 1];
					if (next) {
						if (next.isnote) {
							next = null;
						}
					}
					symbols.push(symbolFromStruct(doc.properties.structure[index], next).symbol);
				}
			}
		}
		return symbols;

	}
}