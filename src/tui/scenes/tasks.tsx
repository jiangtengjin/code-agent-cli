import { Box, Text } from "ink";
import type { ShellTaskEntry, TaskBoardSummary } from "../shell/state.js";

export interface TasksSceneProps {
  summary: TaskBoardSummary;
}

function renderTaskRow(task: ShellTaskEntry) {
  return (
    <Box key={task.id} flexDirection="column" marginTop={1}>
      <Text>
        {task.title} [{task.status}]
      </Text>
      <Text dimColor>
        id: {task.id} | mode: {task.mode ?? "n/a"} | updated: {task.updatedAt}
      </Text>
      {task.detail ? <Text dimColor>{task.detail}</Text> : null}
    </Box>
  );
}

function renderTaskSection(title: string, tasks: ShellTaskEntry[], emptyLabel: string) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text>{title}</Text>
      {tasks.length === 0 ? (
        <Text dimColor>{emptyLabel}</Text>
      ) : (
        tasks.map((task) => renderTaskRow(task))
      )}
    </Box>
  );
}

export function TasksScene({ summary }: TasksSceneProps) {
  return (
    <Box flexDirection="column">
      <Text>Tasks</Text>
      <Text>Session focus: {summary.sessionTitle}</Text>
      <Text dimColor>
        Active: {summary.activeCount} | Queued: {summary.queuedCount} | Finished:{" "}
        {summary.finishedCount}
      </Text>
      <Text dimColor>
        Running: {summary.counts.running} | Awaiting approval: {summary.counts.awaiting_approval} |
        Pending: {summary.counts.pending} | Failed: {summary.counts.failed}
      </Text>
      <Text dimColor>Focused task: {summary.focusedTaskId ?? "none"}</Text>
      {renderTaskSection("Active", summary.active, "No active tasks")}
      {renderTaskSection("Queued", summary.queued, "No queued tasks")}
      {renderTaskSection("Finished", summary.finished, "No finished tasks")}
    </Box>
  );
}
