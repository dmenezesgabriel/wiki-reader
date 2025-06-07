import type { TaskProgress as TaskProgressType } from "../services/GitHubService"
import styles from "./TaskProgress.module.css"

interface TaskProgressProps {
  tasks: TaskProgressType[]
  showAll?: boolean
}

export default function TaskProgress({ tasks, showAll = false }: TaskProgressProps) {
  if (tasks.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.task}>
          <div className={styles.taskHeader}>
            <div className={styles.taskIcon}>
              <div className={styles.spinner}></div>
            </div>
            <div className={styles.taskInfo}>
              <div className={styles.taskName}>Initializing...</div>
              <div className={styles.taskMessage}>Preparing to load repository</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {tasks.map((task) => {
        const shouldShow = showAll || task.status !== "pending"

        if (!shouldShow) return null

        return (
          <div key={task.id} className={`${styles.task} ${styles[task.status]}`}>
            <div className={styles.taskHeader}>
              <div className={styles.taskIcon}>
                {task.status === "pending" && <div className={styles.pending}>⏳</div>}
                {task.status === "running" && <div className={styles.spinner}></div>}
                {task.status === "completed" && <div className={styles.completed}>✅</div>}
                {task.status === "error" && <div className={styles.error}>❌</div>}
              </div>
              <div className={styles.taskInfo}>
                <div className={styles.taskName}>
                  {task.name}
                  {task.id === "parse-files" && task.status === "running" && task.progress !== undefined && (
                    <span className={styles.progressPercent}> ({task.progress}%)</span>
                  )}
                </div>
                {task.message && <div className={styles.taskMessage}>{task.message}</div>}
                {task.error && <div className={styles.taskError}>{task.error}</div>}
              </div>
            </div>
            {task.progress !== undefined && task.progress > 0 && (
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${task.progress}%` }}></div>
                <div className={styles.progressText}>{task.progress}%</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
