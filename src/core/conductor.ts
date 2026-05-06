import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ConductorConfig } from './config';
import { logger } from '../utils/logger';

export interface ReviewRequest {
  request_id: string;
  source: string;
  project: {
    name: string;
    stack: string;
  };
  review: {
    type: 'code' | 'architecture' | 'requirements' | 'task';
    target_file: string;
    content: string;
    context: string;
  };
  agents: string[];
  callback: {
    type: 'local_file' | 'slack' | 'both';
    file_path: string;
    slack_channel: string;
  };
}

export interface ReviewResponse {
  request_id: string;
  status: 'accepted';
  estimated_seconds: number;
}

export interface ReviewResult {
  request_id: string;
  status: 'pending' | 'completed' | 'failed';
  results?: Record<string, {
    summary: string;
    issues: Array<{
      severity: 'critical' | 'warning' | 'info';
      message: string;
      line: number;
    }>;
  }>;
  consensus?: {
    severity: 'critical' | 'warning' | 'info';
    summary: string;
    recommendation: string;
  };
}

export class ConductorClient {
  private endpoint: string;
  private apiKey: string;

  constructor(config: ConductorConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.api_key;
  }

  async submitReview(request: Omit<ReviewRequest, 'request_id' | 'source'>): Promise<ReviewResponse> {
    const fullRequest: ReviewRequest = {
      ...request,
      request_id: uuidv4(),
      source: 'ai-guardian',
    };

    const response = await axios.post<ReviewResponse>(
      `${this.endpoint}/review`,
      fullRequest,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
      },
    );

    logger.info(`Review submitted to conductor (ID: ${fullRequest.request_id})`);
    return response.data;
  }

  async getReviewResult(requestId: string): Promise<ReviewResult> {
    const response = await axios.get<ReviewResult>(
      `${this.endpoint}/review/${requestId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      },
    );

    return response.data;
  }

  async pollReviewResult(requestId: string, maxWaitMs: number = 120000, intervalMs: number = 5000): Promise<ReviewResult> {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const result = await this.getReviewResult(requestId);
      if (result.status === 'completed' || result.status === 'failed') {
        return result;
      }
      logger.debug(`Review ${requestId} still pending, polling again in ${intervalMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Review ${requestId} timed out after ${maxWaitMs}ms`);
  }
}
