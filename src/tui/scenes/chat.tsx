import { Box, Text } from "ink";
import type { ShellChatState } from "../shell/state.js";

export interface ChatSceneProps {
  chat: ShellChatState;
}

export function ChatScene({ chat }: ChatSceneProps) {
  const recentMessages = chat.messages.slice(-3);
  const recentTools = chat.tools.slice(-3);

  return (
    <Box flexDirection="column">
      <Text>Chat</Text>
      <Text dimColor>
        Messages: {chat.messages.length} | Tools: {chat.tools.length}
      </Text>
      {recentMessages.length === 0 ? (
        <Text dimColor>No messages yet</Text>
      ) : (
        recentMessages.map((message) => (
          <Text key={message.id}>
            {message.role}: {message.text || "(empty)"}
          </Text>
        ))
      )}
      {recentTools.length === 0 ? (
        <Text dimColor>No tool activity yet</Text>
      ) : (
        recentTools.map((tool) => (
          <Text key={tool.id}>
            {tool.name} [{tool.status}]
          </Text>
        ))
      )}
    </Box>
  );
}
