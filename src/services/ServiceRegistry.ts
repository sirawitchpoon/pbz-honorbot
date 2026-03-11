import { StatusLogService } from './StatusLogService';
import { LeaderboardService } from './LeaderboardService';

/**
 * Service registry to avoid circular dependencies
 * Services are registered here and can be accessed from event handlers
 */
class ServiceRegistry {
  private statusLogService: StatusLogService | null = null;
  private leaderboardService: LeaderboardService | null = null;

  public setStatusLogService(service: StatusLogService): void {
    this.statusLogService = service;
  }

  public getStatusLogService(): StatusLogService | null {
    return this.statusLogService;
  }

  public setLeaderboardService(service: LeaderboardService): void {
    this.leaderboardService = service;
  }

  public getLeaderboardService(): LeaderboardService | null {
    return this.leaderboardService;
  }
}

export const serviceRegistry = new ServiceRegistry();
