import { Box, Text } from "ink";
import type { MCPHealthSnapshot } from "../../interaction/events.js";

export interface MCPSceneProps {
  servers: MCPHealthSnapshot[];
}

function countServers(servers: MCPHealthSnapshot[], status: MCPHealthSnapshot["status"]): number {
  return servers.filter((server) => server.status === status).length;
}

function renderServer(server: MCPHealthSnapshot) {
  return (
    <Box key={server.serverName} flexDirection="column" marginTop={1}>
      <Text>
        {server.serverName} [{server.status}]
      </Text>
      <Text dimColor>tools: {server.toolCount}</Text>
      {server.message ? <Text dimColor>{server.message}</Text> : null}
    </Box>
  );
}

export function MCPScene({ servers }: MCPSceneProps) {
  const healthyCount = countServers(servers, "healthy");
  const degradedCount = countServers(servers, "degraded");

  return (
    <Box flexDirection="column">
      <Text>MCP</Text>
      <Text dimColor>
        Servers: {servers.length} | Healthy: {healthyCount} | Degraded: {degradedCount}
      </Text>
      {servers.length === 0 ? (
        <Text dimColor>No MCP servers discovered</Text>
      ) : (
        servers.map((server) => renderServer(server))
      )}
    </Box>
  );
}
