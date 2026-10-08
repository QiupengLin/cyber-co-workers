import type { WorkerSession } from '../shared/types';
export function demoSessions(): WorkerSession[] {
 const titles = ['Build navigation', 'Review API changes', 'Write integration tests', 'Refine typography', 'Fix reconnect handling', 'Update documentation', 'Check deployment', 'Explore the codebase'];
 const statuses: WorkerSession['status'][] = ['working','working','waiting','idle','working','idle','waiting','disconnected'];
 return titles.map((title, desk) => ({id:`demo-${desk}`,title,project:desk % 2 ? 'orbital-ui' : 'mission-control',source:desk % 2 ? 'cli' : 'desktop',status:statuses[desk],detail:statuses[desk]==='waiting' ? (desk===2 ? 'Approve running the integration test suite' : 'Which deployment environment should I use?') : statuses[desk]==='disconnected' ? 'Demo connection interrupted' : undefined, updatedAt:Date.now(),desk}));
}
