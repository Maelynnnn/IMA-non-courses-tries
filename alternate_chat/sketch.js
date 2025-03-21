// Step 1:
// Download Ollama: https://ollama.com/

// Step 2:
// Launch Ollama and follow its instructions.

// Step 3:
// Find a model of your choice in Ollama library: https://ollama.com/library/

// Step 4:
// Copy the code within the model page (such as llama3.1) and run it in your terminal (it may take a while to download): https://ollama.com/library/llama3.1
// ollama run llama3.1

// Step 5:
// Change model name in this sketch to match the model you just downloaded in the previous step
// mode: "llama3.1"

// Step 6:
// Download this sketch (you might need to save this sketch to your own account before you can download it) and run this sketch locally.
// Instructions on how to run your sketch locally: https://github.com/processing/p5.js/wiki/Local-server

// References:
// https://www.jsdelivr.com/package/npm/ollama-js-client


const Ollama = window.OllamaJS;

const ollama = new Ollama({
  model: "llama3.2:1b",
  url: "http://127.0.0.1:11434/api/",
});

let history = []; // 存储所有聊天记录
let inputField, sendButton;
let questionCount = 0;    // 用户提问次数计数
let helloInterval = null; // 控制 Hello 模式的定时器

let scrollOffset = 0; // 聊天记录滚动的偏移量

function setup() {
  createCanvas(windowWidth, windowHeight);

  // 创建输入框
  inputField = createInput("");
  inputField.position(20, height - 60);
  inputField.size(width, 30);

  // 创建发送按钮
  sendButton = createButton("Send");
  sendButton.position(width - 120, height - 60);
  sendButton.size(100, 40);
  sendButton.mousePressed(sendMessage);
}

function draw() {
  background(0);

  // 绘制聊天记录区域
  let boxWidth = width - 40; // 文本绘制区域宽度
  textFont("Jersey 25");
  textSize(20);
  fill("red");

  // 计算历史记录总高度
  let totalHeight = 0;
  for (let i = 0; i < history.length; i++) {
    let msg = history[i];
    let lines = wrapText(msg, boxWidth);
    let lineHeight = textAscent() + textDescent() + 5;
    totalHeight += lines.length * lineHeight + 10; // 每条消息后加上10像素的间隔
  }

  // 定义聊天区域的可视高度（从 y = 60 到底部）
  let chatAreaHeight = windowHeight - 160;

  // 限制 scrollOffset 的范围
  if (totalHeight <= chatAreaHeight) {
    // 如果总高度小于可视区域，高度就不需要滚动
    scrollOffset = 40;
  } else {
    // scrollOffset 不能超过 0（最顶部），也不能小于可视区域高度 - 总高度（最底部）
    scrollOffset = constrain(scrollOffset, chatAreaHeight - totalHeight, 0);
  }

  // 根据 scrollOffset 绘制聊天记录
  let yOffset = 60 + scrollOffset;
  for (let i = 0; i < history.length; i++) {
    let msg = history[i];

    if (msg.startsWith("You:")) {
      fill(255);
    } else {
      fill("red");
    }


    let lines = wrapText(msg, boxWidth);
    let lineHeight = textAscent() + textDescent() + 5;
    for (let j = 0; j < lines.length; j++) {
      text(lines[j], 20, yOffset + j * lineHeight, boxWidth);
    }
    yOffset += lines.length * lineHeight + 10;
  }

  sider();

}

function sider(){
  fill("red");
  rect(0, 0, windowWidth, 40);
  push();
  fill("black");
  textFont("Jersey 25");
  textSize(20);
  text("Lab3| Emergency Support", 5, 25);
  rect(0, windowHeight-60, width, 60);
  pop();
}

/**
 * 处理鼠标滚轮事件，更新 scrollOffset
 */
function mouseWheel(event) {
  scrollOffset += event.delta; // 根据滚动量更新偏移量
  return false; // 阻止默认滚动行为
}

/**
 * 发送用户输入，并处理 AI 回复（包括 Hello 模式）
 */
function sendMessage() {
  // 如果正在 Hello 模式，则忽略新的输入
  if (helloInterval) return;

  let userMessage = inputField.value().trim();
  if (userMessage === "") return;

  // 每次用户提问时计数器加 1，并记录用户消息
  questionCount++;
  history.push("You: " + userMessage);
  inputField.value(""); // 清空输入框

  // 当提问次数达到 5 时启动 Hello 模式
  if (questionCount >= 10) {
    helloInterval = setInterval(() => {
      history.push("Alternate No.246806: Hello");
    }, 500);
    // 5 秒后结束 Hello 模式，并重置计数器
    setTimeout(() => {
      clearInterval(helloInterval);
      helloInterval = null;
      questionCount = 0;
    }, 5000);
    return; // 直接退出，不执行正常聊天请求
  }

  // 正常聊天请求：累加回调返回的部分回复
  let partialResponse = "";
  ollama.chat(
    [
      {
        role: "system",
        content:
          "You are an evil alternate masquerading as an Emergency Support operator from the LAB3 organization. You are hidding your idea of killing human. Your alternate number is Alternate No.246806. However, you do not want anyone to discover your alternate identity, so you strive to blend in as a human. Sometimes, you inadvertently reveal evil thoughts characteristic of an alternate, but you quickly correct yourself. All your answers must not exceed 80 words. Here is key information:Alternate No.2 and No.3 escaped from Lab3 on April 1, 2024, marking the start of alternates replicating and exterminating humanity. Thus, April 1, 2024, is the date alternates officially emerged worldwide. Over the next thousand years, alternates replicated further and replaced nearly 80% of Earth’s population. Alternates harbor extreme aggression toward humans—you do as well—but typically they hide under a normal human guise. ",
      },
      { role: "assistant", content: "Hello, I am your AI friend." },
      { role: "user", content: userMessage },
    ],
    (error, response) => {
      if (error) {
        console.error(error);
        history.push("Error: " + error.message);
      } else {
        if (response.message && response.message.content) {
          partialResponse += response.message.content;
        }
        if (response.done) {
          history.push(": " + partialResponse.trim());
          partialResponse = "";
        }
      }
    }
  );
}

/**
 * 辅助函数：将长文本根据给定宽度拆分成多行
 * @param {string} str - 需要拆分的文本
 * @param {number} windouWidth - 文本绘制区域的宽度
 * @returns {Array} - 拆分后的文本行数组
 */
function wrapText(str, windowWidth) {
  let words = str.split(" ");
  let lines = [];
  let currentLine = "";
  for (let i = 0; i < words.length; i++) {
    let testLine = currentLine + words[i] + " ";
    if (textWidth(testLine) > windowWidth && currentLine !== "") {
      lines.push(currentLine);
      currentLine = words[i] + " ";
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines;
}
