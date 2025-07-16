/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useRef, useEffect } from "react";
import DOMPurify from "dompurify";
import RobotIcon from "../assets/icons/RobotIcon";
import MessageSquareChat from "../assets/icons/MessageSquareChat";
import CloseIcon from "../assets/icons/CloseIcon";
import Logo from "../assets/images/logo.png";
import EditIcon from "../assets/icons/EditIcon";
import RobotPulse from "../assets/icons/RobotPulse";
import FlairstechLogo from "../assets/images/flairstech-logo.png";
import SendIcon from "../assets/icons/SendIcon";
import MessageCircle from "../assets/icons/MessageCircle";
import WriteIcon from "../assets/icons/WriteIcon";
import ProfilePicture from "../assets/images/profile-picture.png";
import BotThinking from "../assets/icons/BotThinking";
import ErrorIcon from "../assets/icons/ErrorIcon";

interface Message {
  sender: "user" | "bot";
  text: string;
  timestamp: string;
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [_, setTtft] = useState<number | null>(null);
  const [imageModal, setImageModal] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const suggestions = [
    "Types of KPIs?",
    "How to assign KPIs?",
    "Appeal process?",
    "Supervisor assessment?",
    "Score calculation?",
    "New employee guide?",
  ];

  const getCurrentTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
  };

  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setMessage("");
    setIsBotTyping(false);
    setTtft(null);
  };

  const handleSuggestionClick = (text: string) => {
    handleSend(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend(message);
  };

  const handleSend = async (text: string) => {
    if (!text.trim() || isBotTyping) return;

    const userMsg: Message = {
      sender: "user",
      text,
      timestamp: getCurrentTimestamp(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setMessage("");
    setIsBotTyping(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    let reader: ReadableStreamDefaultReader | null = null;
    let botText = "";
    let botMessageAdded = false;

    try {
      const response = await fetch(
        "http://192.168.50.99:8002/api/chat/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: [...messages, userMsg].map((msg) => ({
              role: msg.sender === "user" ? "user" : "assistant",
              content: msg.text,
            })),
            stream: true,
            max_tokens: 2048,
            temperature: 0.1,
            top_p: 0.95,
            top_k: 40,
            user_id: "folla-user",
            session_id: "folla-session",
          }),
          signal: abortController.signal,
        }
      );

      if (!response.ok)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      if (!response.body) throw new Error("No response stream");

      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          setIsBotTyping(false);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data:")) {
            try {
              const json = JSON.parse(line.replace(/^data:\s*/, ""));
              if (json.type === "ttft") {
                setTtft(json.value);
                console.log(`⚡ First token in ${json.value.toFixed(3)}s`);
              } else if (json.type === "content" || json.type === "token") {
                if (!botMessageAdded) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      sender: "bot",
                      text: "",
                      timestamp: getCurrentTimestamp(),
                    },
                  ]);
                  botMessageAdded = true;
                  setIsBotTyping(false); // Hide thinking indicator when content starts
                }
                botText += json.content;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastBotIndex = newMessages.length - 1;
                  newMessages[lastBotIndex] = {
                    ...newMessages[lastBotIndex],
                    text: botText,
                  };
                  return newMessages;
                });
              } else if (json.type === "image") {
                if (!botMessageAdded) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      sender: "bot",
                      text: "",
                      timestamp: getCurrentTimestamp(),
                    },
                  ]);
                  botMessageAdded = true;
                  setIsBotTyping(false); // Hide thinking indicator for image
                }
                const altText = json.alt || "Image";
                const base64Data = json.content;
                botText += `![${altText}](data:image/png;base64,${base64Data})`;
                setMessages((prev) => {
                  const newMessages = [...prev];
                  const lastBotIndex = newMessages.length - 1;
                  newMessages[lastBotIndex] = {
                    ...newMessages[lastBotIndex],
                    text: botText,
                  };
                  return newMessages;
                });
              } else if (json.type === "complete") {
                setIsBotTyping(false);
                console.log(
                  `✅ Complete! ${json.tokens_generated || 0} tokens`
                );
                break;
              } else if (json.type === "error") {
                throw new Error(json.error);
              } else {
                console.warn(`Unknown SSE event type: ${json.type}`);
              }
            } catch (e) {
              console.warn("Failed to parse SSE data:", line, e);
            }
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          sender: "bot",
          text: `__ERROR__An error occurred: ${
            err instanceof Error ? err.message : String(err)
          }`,
          timestamp: getCurrentTimestamp(),
        },
      ]);
      setIsBotTyping(false);
    } finally {
      if (reader) {
        try {
          reader.releaseLock();
        } catch (e) {
          console.warn("Reader already released");
        }
      }
      abortControllerRef.current = null;
    }
  };

  const renderMarkdown = (content: string) => {
    let html = content;

    html = html.replace(
      /\|(.+)\|\n\|[\s\-|:]+\|\n((?:\|.+\|\n?)*)/g,
      (header, rows) => {
        const headerCells = header
          .split("|")
          .map((cell) => cell.trim())
          .filter((cell) => cell);
        const rowLines = rows.trim().split("\n");

        let tableHTML = '<div class="table-container"><table>';
        tableHTML += "<thead><tr>";
        headerCells.forEach((cell) => {
          tableHTML += `<th>${cell}</th>`;
        });
        tableHTML += "</tr></thead><tbody>";
        rowLines.forEach((row: string) => {
          if (row.trim()) {
            const cells = row
              .split("|")
              .map((cell) => cell.trim())
              .filter((cell) => cell);
            tableHTML += "<tr>";
            cells.forEach((cell) => {
              tableHTML += `<td>${cell}</td>`;
            });
            tableHTML += "</tr>";
          }
        });
        tableHTML += "</tbody></table></div>";
        return tableHTML;
      }
    );

    html = html.replace(
      /!\[([^\]]*)\]\(data:image\/[^;]+;base64,([^)]+)\)/g,
      '<img src="data:image/png;base64,$2" alt="$1" class="max-w-full h-auto cursor-pointer" />'
    );

    html = html.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");

    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    html = html.replace(/^\d+\.\s+(.*)$/gim, "<li>$1</li>");
    html = html.replace(/^[-*+]\s+(.*)$/gim, "<li>$1</li>");

    html = html.replace(/^>\s+(.*)$/gim, "<blockquote>$1</blockquote>");

    html = html.replace(/\n\n/g, "</p><p>");
    html = html.replace(/\n/g, "<br>");

    html = "<p>" + html + "</p>";

    html = html.replace(/<\/p><p>(<li>.*?<\/li>)/g, "<ul>$1");
    html = html.replace(/(<li>.*?<\/li>)<\/p><p>/g, "$1</ul><p>");
    html = html.replace(/(<\/li>)<br>(<li>)/g, "$1$2");

    html = html.replace(/<p><\/p>/g, "");
    html = html.replace(/<p><br><\/p>/g, "");
    html = html.replace(/<br><br>/g, "<br>");
    html = html.replace(/<p>\s*<\/p>/g, "");

    return DOMPurify.sanitize(html);
  };

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isBotTyping]);

  return (
    <>
      {imageModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          onClick={() => setImageModal(null)}
        >
          <img
            src={imageModal}
            alt="Preview"
            className="max-w-full max-h-full rounded-lg"
          />
        </div>
      )}

      {isOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-[480px] h-[640px] bg-[#F9FBFC] border border-[#E9EAEB] shadow-xl rounded-2xl flex flex-col overflow-hidden">
          <div className="folla-gradient-blur absolute inset-0 top-90 left-90 -z-10 opacity-80" />
          <div className="folla-gradient-blur absolute inset-0 bottom-50 right-90 -z-10 opacity-80" />

          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E9EAEB] bg-white">
            <div className="flex items-center gap-2">
              <img src={Logo} alt="folla logo" />
            </div>
            <div className="flex items-center gap-5">
              <button
                onClick={handleNewChat}
                className="text-sm text-[#181D27] font-medium flex items-center gap-2"
              >
                <EditIcon />
                New chat
              </button>
              <button onClick={toggleChat} className="p-1" aria-label="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          {messages.length === 0 && !isBotTyping && (
            <div className="flex flex-col justify-end items-end flex-1 px-4 pb-2 pt-12 w-full">
              <div className="flex flex-col items-center text-center mx-auto max-w-[320px]">
                <RobotPulse />
                <h2 className="font-semibold text-xl mb-1.5 mt-1.5 text-[#181D27]">
                  How can Folla help you?
                </h2>
                <p className="text-sm text-[#535862] font-normal">
                  lorem ipsum dolor sit amet consectetur adipiscing elit
                </p>
              </div>
              <div className="mt-auto">
                <p className="font-medium text-base mb-2 text-[#181D27]">
                  Suggest for you
                </p>
                <div className="flex flex-wrap gap-2 bg-white p-3 rounded-xl shadow-sm">
                  {suggestions.map((text, i) => (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(text)}
                      className="flex items-center gap-1 px-3 py-2.5 text-sm font-normal bg-[#F9FBFC] rounded-full border border-[#E9EAEB] text-[#252B37] hover:bg-[#F9FBFC]"
                    >
                      <WriteIcon />
                      <span className="ml-2">{text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {(messages.length > 0 || isBotTyping) && (
            <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${
                    msg.sender === "bot" ? "flex-row" : "flex-row-reverse"
                  } items-start gap-2`}
                >
                  {msg.sender === "bot" ? (
                    <RobotIcon />
                  ) : (
                    <img
                      src={ProfilePicture}
                      alt="User"
                      className="w-8 h-8 rounded-full"
                    />
                  )}
                  <div>
                    <p className="flex items-center justify-between text-sm text-[#181D27] font-medium mb-1">
                      {msg.sender === "bot" ? "Folla" : "You"}
                      <span className="ml-1 text-[#535862] font-normal text-xs">
                        {msg.timestamp}
                      </span>
                    </p>
                    {msg.text.startsWith("__ERROR__") ? (
                      <div
                        className={`bg-white rounded-lg px-3 py-2 text-sm border border-[#E9EAEB] max-w-xs text-[#181D27] font-normal flex items-start gap-2 ${
                          msg.sender === "bot"
                            ? "border-s-0 rounded-tl-none"
                            : "border-e-0 rounded-tr-none"
                        }`}
                      >
                        <ErrorIcon />
                        <span>{msg.text.replace("__ERROR__", "")}</span>
                      </div>
                    ) : (
                      <div
                        className={`bg-white rounded-lg px-3 py-2 text-sm border border-[#E9EAEB] max-w-xs text-[#181D27] font-normal prose ${
                          msg.sender === "bot"
                            ? "border-s-0 rounded-tl-none"
                            : "border-e-0 rounded-tr-none"
                        }`}
                        dangerouslySetInnerHTML={{
                          __html: renderMarkdown(msg.text || ""),
                        }}
                        onClick={(e) => {
                          const img = (e.target as HTMLElement).closest("img");
                          if (img && img.src.startsWith("data:image/")) {
                            setImageModal(img.src);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              ))}
              {isBotTyping && (
                <div className="flex items-start">
                  <RobotIcon />
                  <div className="bg-white flex items-center justify-center gap-0 ml-2 rounded-lg border-s-0 rounded-tl-none px-3 py-1 text-sm border border-[#E9EAEB] max-w-xs">
                    <BotThinking />
                    <div className="flex gap-1 px-2 py-1">
                      <span className="w-1 h-1 bg-[#535862] rounded-full animate-bounce-small delay-0"></span>
                      <span className="w-1 h-1 bg-[#A4A7AE] rounded-full animate-bounce-small delay-200"></span>
                      <span className="w-1 h-1 bg-[#535862] rounded-full animate-bounce-small delay-400"></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          <div className="px-4 pb-4">
            <div className="flex items-center justify-center bg-white border border-[#E9EAEB] rounded-[31.25rem] pl-4 pr-2 py-2">
              <span
                className="rounded-full w-8 h-8 flex items-center justify-center shrink-0"
                aria-label="message icon"
              >
                <MessageCircle />
              </span>
              <input
                type="text"
                value={message}
                placeholder="Message Folla..."
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyPress}
                className="flex-1 bg-transparent placeholder:text-[#717680] font-normal outline-none text-sm indent-2"
              />
              <button
                onClick={() => handleSend(message)}
                className="text-red-600 hover:bg-red-700 bg-[#CF3B27] rounded-full w-8 h-8 flex items-center justify-center shrink-0"
                aria-label="Send"
              >
                <SendIcon />
              </button>
            </div>
            <p className="text-center flex items-center justify-center gap-2 text-xs mt-4 text-[#414651] font-normal">
              Powered by <img src={FlairstechLogo} alt="flairstech logo" />
            </p>
          </div>
        </div>
      )}

      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            className="relative"
          >
            <div
              className={`absolute bottom-4 right-0 w-[20.5rem] pl-6 py-5 bg-[#F9FBFC] border border-[#E9EAEB] shadow-xl rounded-2xl text-[#181D27] font-normal text-sm leading-[1.23rem] transition-all duration-300 ease-out
              ${
                isHovered
                  ? "opacity-100 translate-y-0 pointer-events-auto"
                  : "opacity-0 translate-y-2 pointer-events-none"
              }`}
            >
              <div className="absolute -top-8 left-1/2 transform -translate-x-1/2">
                <RobotIcon />
              </div>
              <p className="leading-snug text-start w-full break-words">
                Lorem ipsum dolor sit amet consectetur adipiscing elit
              </p>
            </div>
          </div>
        )}

        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <button
            onClick={toggleChat}
            aria-label={isOpen ? "Close chat" : "Open chat"}
            className="bg-[#CF3B27] hover:bg-red-700 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300"
          >
            <MessageSquareChat />
          </button>
        </div>
      </div>
    </>
  );
};

export default ChatWidget;
