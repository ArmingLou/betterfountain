const getFontAscent = require("./fontHandler");
const { normalizeTexts, summarizeParagraphs } = require("./dataRearanger");
const { measureTextsWidth, measureTextWidth } = require("./textMeasurement");
const { lineWrapParagraph, removeSubsequentSpaces } = require("./lineWrapper");

// This is the main package of textbox-for-pdfkit. It is the main function
// which prepares the data by calling all the subfunctions.
// Also it handles the drawing of the text on the pdf, after it was prepared.

// Default Style. If one style attribute is not set when calling addTextbox, the
// respective default attribute is set.
const defaultStyle = {
  font: "Times-Roman",
  fontSize: 12,
  lineHeight: 1,
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

function addTextbox(text, doc, posX, posY, width, style = {}) {
  // width = width - 36;
  const textboxStyle = { ...defaultStyle, ...style };
  const normalizedTexts = normalizeTexts(text, textboxStyle);
  const textsWithWidth = measureTextsWidth(normalizedTexts, doc);
  const paragraphedTexts = summarizeParagraphs(textsWithWidth);
  const lines = paragraphedTexts.flatMap((pTexts) => {
    return lineWrapParagraph(pTexts, width, doc);
  });
  const optimizedLines = removeSubsequentSpaces(lines, doc);

  const baseline = style.baseline || "alphabetic";

  drawTextLinesOnPDF(optimizedLines, width, posX, posY, textboxStyle, doc, baseline);

  return optimizedLines.length;
}

// This function takes the prepared Data and draws everything on the right
// position of the PDF

function drawTextLinesOnPDF(lines, width, posX, posY, defaultStyle, doc, baseline) {
  // let yPosition =
  //   posY + getFontAscent(defaultStyle.font, defaultStyle.fontSize);
  let yPosition = 0;
  if (defaultStyle.font_height) {
    var k = getFontAscent(defaultStyle.font, defaultStyle.fontSize);
    yPosition = posY + defaultStyle.font_height;
  } else {
    yPosition = posY + getFontAscent(defaultStyle.font, defaultStyle.fontSize);
  }
  lines.forEach((line, index) => {
    if (index !== 0) {
      if (defaultStyle.font_height) {
        yPosition += defaultStyle.font_height;
      }
      else {
        yPosition += line.lineHeight;
      }
    }
    let xPosition = getLineStartXPosition(line, width, posX);
    line.texts.forEach((textPart) => {
      doc
        .font(textPart.font)
        .fontSize(textPart.fontSize)
        .fillColor(textPart.color)
        .text(textPart.text, xPosition, yPosition, {
          link: textPart.link,
          align: "left",
          baseline: baseline,
          oblique: textPart.oblique,
          underline: textPart.underline,
          strike: textPart.strike,
          width: width,
        });
      xPosition += textPart.width;
    });
  });
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
          res.push(lineText);
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
            res.push(lineText);
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
    if (lineText !== "") {
      res.push(lineText);
    }
  });

  return res;
}

module.exports = { addTextbox, breakLines };
