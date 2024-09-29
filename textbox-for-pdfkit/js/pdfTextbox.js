const getFontAscent = require("./fontHandler");
const { normalizeTexts, summarizeParagraphs } = require("./dataRearanger");
const { measureTextsWidth, measureTextWidth, measureTextHeight } = require("./textMeasurement");
const { lineWrapParagraph, removeSubsequentSpaces } = require("./lineWrapper");

// This is the main package of textbox-for-pdfkit. It is the main function
// which prepares the data by calling all the subfunctions.
// Also it handles the drawing of the text on the pdf, after it was prepared.

// Default Style. If one style attribute is not set when calling addTextbox, the
// respective default attribute is set.
const defaultStyle = {
  font: "Times-Roman",
  fontSize: 12,
  // lineHeight: 12,
  align: "left",
  color: "#000000",
  removeSubsequentSpaces: true,
  link: null,
  oblique: 0,
  underline: false,
};

// This is the only function which is needed in the end. It calls
// every needed function step by step. Details what all functions
// are doing can be found in the respective packages (where the functions
// are defined)

function addTextbox(text, doc, posX, posY, width, posTop, firstBreakHeight, breakHeight, switchPageFrom, switchPageTo, style = {}) {
  // width = width - 36;
  if (text.length <= 0) {
    text = [""];
  }
  const textboxStyle = { ...defaultStyle, ...style };
  const normalizedTexts = normalizeTexts(text, textboxStyle);
  const textsWithWidth = measureTextsWidth(normalizedTexts, doc);
  const paragraphedTexts = summarizeParagraphs(textsWithWidth);
  const lines = paragraphedTexts.flatMap((pTexts) => {
    return lineWrapParagraph(pTexts, width, doc);
  });
  const optimizedLines = removeSubsequentSpaces(lines, doc);

  const baseline = 'top';// style.baseline || "alphabetic";

  return drawTextLinesOnPDF(optimizedLines, width, firstBreakHeight, breakHeight, switchPageFrom, switchPageTo, posX, posY, posTop, textboxStyle, doc, baseline);

  // if (optimizedLines.length <= 0) {
  //   // 至少有一行
  //   return 1;
  // }

  // return optimizedLines.length;
}

// This function takes the prepared Data and draws everything on the right
// position of the PDF

function drawTextLinesOnPDF(lines, width, firstBreakHeight, breakHeight, switchPageFrom, switchPageTo, posX, posY, posTop, defaultStyle, doc, baseline) {
  let h = 0;
  let breaks = 0;
  let bh = firstBreakHeight || breakHeight || 0;
  var pageIdx = switchPageFrom || 0;
  var switches = 0;
  // let yPosition =
  //   posY + getFontAscent(defaultStyle.font, defaultStyle.fontSize);
  // let yPosition = posY;
  // if (defaultStyle.font_height) {
  //   // var k = getFontAscent(defaultStyle.font, defaultStyle.fontSize);
  //   yPosition = posY + defaultStyle.font_height;
  // } else {
  //   yPosition = posY + getFontAscent(defaultStyle.font, defaultStyle.fontSize);
  // }
  lines.forEach((line, index) => {
    if (bh && h + line.lineHeight > bh + 0.0001) { // 0.0001 for rounding errors
    // if (bh && h + line.lineHeight > bh ) { // 0.0001 for rounding errors
      if (switchPageTo > pageIdx) {
        pageIdx++;
        doc.switchToPage(pageIdx);
        switches++;
      } else {
        doc.addPage();
        breaks++;
      }
      h = 0;
      bh = breakHeight;
      posY = posTop;
    }
    // if (index !== 0) {
    // if (defaultStyle.font_height) {
    //   yPosition += defaultStyle.font_height;
    // }
    // else {
    // yPosition += line.lineHeight;
    // }
    // }
    let xPosition = getLineStartXPosition(line, width, posX);
    let yPosition = posY + h;
    line.texts.forEach((textPart) => {
      // var y = getFontAscent(textPart.font, textPart.fontSize)
      var y = measureTextHeight(textPart.text, textPart.font, textPart.fontSize, doc);
      // var y = 0;
      // if (defaultStyle.font_height) {
      //   y = defaultStyle.font_height - y;
      // }else {
      y = line.lineHeight - y;
      // }
      doc
        .font(textPart.font)
        .fontSize(textPart.fontSize)
        .fillColor(textPart.color)
        .strokeColor(textPart.color)
        .text(textPart.text, xPosition, yPosition + y, {
          link: textPart.link,
          align: "left",
          baseline: baseline,
          oblique: textPart.oblique,
          underline: textPart.underline,
          strike: textPart.strike,
          stroke: textPart.stroke,
          width: width,
        });
      xPosition += textPart.width;
    });
    h += line.lineHeight;
  });

  return { height: h, breaks: breaks, switches: switches };
}

// This function handles the setting of the line start X-position
// depending on its "align" attribute
function getLineStartXPosition(line, width, posX) {
  const spaceLeft = width - line.width;
  if (spaceLeft < 0) return posX;

  switch (line.align) {
    case "left":
      return posX;
    case "center":
      return posX + spaceLeft / 2;
    case "right":
      return posX + spaceLeft;
    default:
      return posX;
  }
}


function measureTextFragmentsExclude(textArray, font, fontSize, doc, exclude) {
  return textArray.map((textFragment) => {
    if (textFragment === " ") {
      return {
        text: textFragment,
        style_text: textFragment,
        width: measureTextWidth(" ", font, fontSize, doc),
      };
    }
    var tx = ""; // 带样式字符
    var tx2 = ""; // 去掉样式字符后
    for (var i = 0; i < textFragment.length; i++) {
      tx += textFragment[i];
      if (exclude.indexOf(textFragment[i]) < 0) {
        tx2 += textFragment[i];
      }
    }
    return {
      text: tx2,
      style_text: tx,
      width: measureTextWidth(tx2, font, fontSize, doc),
    };
  });
}

// text 包含样式特殊字符的文本
// width 需要断行的宽度
// exclude 指定需要排除长度的样式特殊字符
function breakLines(text, width, font, fontSize, doc, exclude) {
  // width = width - 36;
  var res = [];
  const lineBreakedText = text.split("\n")

  lineBreakedText.forEach((line) => {

    const fragmentArray = line.split(/(?<=[ -])|(?= )/);
    const fragmentArrayWithWidth = measureTextFragmentsExclude(
      fragmentArray,
      font,
      fontSize,
      doc,
      exclude
    );
    // const lines = [];
    let lineText = ""; // 含样式符号
    let isWrap = false; // 该行是超长截断自动换行的情况，每个/n换行后重置。
    // let lineWidth = 0;
    let spaceLeft = width;
    fragmentArrayWithWidth.forEach((textFragment) => {
      // Here we fill fragment by Fragment in lines
      if (textFragment.width <= spaceLeft) {
        // If it fits in line --> Add to line
        // lineWidth += textFragment.width;
        spaceLeft -= textFragment.width;
        lineText = lineText + textFragment.style_text;
      } else if (textFragment.style_text !== " ") {
        // If it doesn't fit, add full line to lines, and add text to new line.
        // If there are many spaces at a line end --> ignore them.
        if (textFragment.text.match(/^[a-zA-Zа-яА-ЯёЁéÈçÇàÀäÄöÖüÜïÏêÊîÎôÔñÑ\s\d]+$/u)) {
          // 字母和数字不截断
          if (lineText) {
            res.push({ text: lineText, isWrap: isWrap });
            isWrap = true; // push了第一行以后，都是wrap
          }
          // lineWidth = 0;
          spaceLeft = width;
          lineText = "";
          // lineWidth = textFragment.width;
          // spaceLeft = widthTextbox - textFragment.width;
          // lineText = textFragment.text;
        }


        var tx = "";
        var tx2 = ""; // 去掉style特殊字符
        var tx_l = "";
        var w = 0;
        for (var i = 0; i < textFragment.style_text.length; i++) {
          tx += textFragment.style_text[i];
          if (exclude.indexOf(textFragment.style_text[i]) > -1) {
            tx_l = tx;
            continue
          }
          tx2 += textFragment.style_text[i];
          w = measureTextWidth(tx2, font, fontSize, doc);
          if (w >= spaceLeft) {
            if (tx_l) {
              lineText = lineText + tx_l;
            }
            if (lineText) {
              res.push({ text: lineText, isWrap: isWrap });
              isWrap = true; // push了第一行以后，都是wrap
            }
            // lineWidth = 0;
            spaceLeft = width;
            lineText = "";
            tx = textFragment.style_text[i];
            tx2 = textFragment.style_text[i];
            w = measureTextWidth(tx2, font, fontSize, doc);
          }
          tx_l = tx;
        }
        // lineWidth += w;
        spaceLeft -= w;
        lineText = lineText + tx;
      }
    });
    // if (lineText !== "") {
    res.push({ text: lineText, isWrap: isWrap });
    // }
  });

  return res;
}

module.exports = { addTextbox, breakLines };
