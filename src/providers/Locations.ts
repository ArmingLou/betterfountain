import * as vscode from 'vscode';
import { activeParsedDocument } from '../extension';
import { FSFormat } from '../utils/format';
import { SceneTreeItem } from './Scene';
import { Location } from '../afterwriting-parser';

export class FountainLocationTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public readonly onDidChangeTreeDataEmitter: vscode.EventEmitter<vscode.TreeItem | null> =
    new vscode.EventEmitter<vscode.TreeItem | null>();
  public readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | null> = this.onDidChangeTreeDataEmitter.event;

  private treeRoot: LocationTreeItem;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(element?: LocationTreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return element.children;
    }
    if (this.treeRoot && this.treeRoot.children) {
      return this.treeRoot.children;
    } else {
      return []
    }
  }

  update(): void {
    this.treeRoot = buildLocationTree();
    this.onDidChangeTreeDataEmitter.fire(void 0);
  }
}

function buildLocationTree(): LocationTreeItem {
  const root = new LocationTreeItem("", [], null);
  root.children = [];

  const doc = activeParsedDocument();
  if (doc) {
    const locations = doc.properties.locations;
    for (const [name, scenes] of locations) {
      const child = new LocationTreeItem(FSFormat.locationToNatural(name), scenes, root);
      root.children.push(child);
    }
  }
  return root;
}

class LocationTreeItem extends vscode.TreeItem {
  children: vscode.TreeItem[] = [];

  constructor(label: string, public locations: Location[], public parent: LocationTreeItem) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    var scencNum = new Set();
    for (const location of locations) {
      var nb = location.scene_number;
      if(scencNum.has(nb)) {
        nb = `↑${nb}`;
      } else {
        scencNum.add(location.scene_number);
      }
      this.children.push(new SceneTreeItem(`Scene ${nb} - ${location.time_of_day}`, location.line, this));
    }
    this.description = `${scencNum.size} scenes`;
  }
}

export class LocationDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(document: vscode.TextDocument, position: vscode.Position): vscode.Definition {
    const doc = activeParsedDocument();
    if (!doc) return null;
    
    if (doc.properties.characterLines.has(position.line)) {
      // 排除角色行中场景名称
      return null;
    }

    const lineText = document.lineAt(position.line).text;
    for (const [name, locations] of doc.properties.locations) {
      if (lineText.includes(name)) {

        if (lineText.indexOf('#${') > 0) {
          if (position.character > lineText.indexOf('#${')) {

            var currentLocation = locations.find(loc => {
              if (loc.line == position.line) {
                // 如果当前行是引用行，返回所有引用
                return true;
              }
              return false;
            });
            // 指向相同场号
            return locations.filter(loc => loc.scene_number == currentLocation.scene_number).map(loc => new vscode.Location(
              document.uri,
              new vscode.Range(new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf('#${')), new vscode.Position(loc.line, document.lineAt(loc.line).text.length))
            ));
          }
        }

        var st = lineText.indexOf(name);
        var en = st + name.length;
        if (position.character < st || position.character > en) {
          return null;
        }
        return locations.map(loc => new vscode.Location(
          document.uri,
          new vscode.Range(new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name)), new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name) + name.length))
        ));
      }
    }
    return null;
  }
}

export class LocationReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(document: vscode.TextDocument, position: vscode.Position, _context: vscode.ReferenceContext): vscode.ProviderResult<vscode.Location[]> {
    const doc = activeParsedDocument();
    if (!doc) return null;
    
    if (doc.properties.characterLines.has(position.line)) {
      // 排除角色行中场景名称
      return null;
    }

    const lineText = document.lineAt(position.line).text;

    // 收集所有引用位置的行
    for (const [name, locations] of doc.properties.locations) {
      if (lineText.includes(name)) {
        if (lineText.indexOf('#${') > 0) {
          if (position.character > lineText.indexOf('#${')) {

            var currentLocation = locations.find(loc => {
              if (loc.line == position.line) {
                // 如果当前行是引用行，返回所有引用
                return true;
              }
              return false;
            });
            // 指向相同场号
            return locations.filter(loc => loc.scene_number == currentLocation.scene_number).map(loc => new vscode.Location(
              document.uri,
              new vscode.Range(new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf('#${')), new vscode.Position(loc.line, document.lineAt(loc.line).text.length))
            ));
          }
        }
        var st = lineText.indexOf(name);
        var en = st + name.length;
        if (position.character < st || position.character > en) {
          continue;
        }
        // 返回第一个
        return locations.map(loc => new vscode.Location(
          document.uri,
          new vscode.Range(new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name)), new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name) + name.length))
        ));
      }
    }

    return null;
  }
}

export class LocationHoverProvider implements vscode.HoverProvider {
  provideHover(document: vscode.TextDocument, position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
    const doc = activeParsedDocument();
    if (!doc) return null;
    
    if (doc.properties.characterLines.has(position.line)) {
      // 排除角色行中场景名称
      return null;
    }

    const lineText = document.lineAt(position.line).text;

    for (const [name, locations] of doc.properties.locations) {
      if (lineText.includes(name)) {

        if (lineText.indexOf('#${') > 0) {
          if (position.character > lineText.indexOf('#${')) {

            var currentLocation = locations.find(loc => {
              if (loc.line == position.line) {
                // 如果当前行是引用行，返回所有引用
                return true;
              }
              return false;
            });
            // 指向相同场号
            var count = locations.filter(loc => loc.scene_number == currentLocation.scene_number).length
            var txt = `(Scene ${currentLocation.scene_number}) was split into ${count}`;

            const hoverText = new vscode.MarkdownString(txt);
            hoverText.isTrusted = true;

            return new vscode.Hover(hoverText, new vscode.Range(position.line, lineText.indexOf('#${'), position.line, lineText.length));
          }
        }

        var st = lineText.indexOf(name);
        var en = st + name.length;
        if (position.character < st || position.character > en) {
          continue;
        }

        locations.map(loc => new vscode.Location(
          document.uri,
          new vscode.Range(new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name)), new vscode.Position(loc.line, document.lineAt(loc.line).text.indexOf(name) + name.length))
        ));

        const sceneList = locations
          .map(loc => `${loc.scene_number}`)
          // 去除重复的场号
          .filter((value, index, self) => self.indexOf(value) === index)
          .map(tx => `Scene ${tx}`)
          .join(", ");

        var txt = `**${name}**  \n\nappears in:  \n${sceneList}`;

        const hoverText = new vscode.MarkdownString(txt);
        hoverText.isTrusted = true;

        return new vscode.Hover(hoverText, new vscode.Range(position.line, st, position.line, en));
      }
    }

    return null;
  }

}