import type { RepositoryListResponse } from '@/lib/types/repository';

export type OpportunityPoolStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error';

export type OpportunityPoolViewState =
  | 'collapsed'
  | 'loading'
  | 'success'
  | 'empty'
  | 'error';

export type OpportunityPoolState =
  | {
      status: 'idle';
      queryKey: string | null;
    }
  | {
      status: 'loading';
      queryKey: string;
    }
  | {
      status: 'success';
      queryKey: string;
      response: RepositoryListResponse;
    }
  | {
      status: 'empty';
      queryKey: string;
      response: RepositoryListResponse;
    }
  | {
      status: 'error';
      queryKey: string;
      errorMessage: string;
    };

export type OpportunityPoolAction =
  | {
      type: 'start';
      queryKey: string;
    }
  | {
      type: 'resolve';
      queryKey: string;
      response: RepositoryListResponse;
    }
  | {
      type: 'fail';
      queryKey: string;
      errorMessage: string;
    }
  | {
      type: 'reset';
      queryKey: string;
    }
  | {
      type: 'collapse';
      queryKey: string;
    };

export function createOpportunityPoolIdleState(
  queryKey: string | null = null,
): OpportunityPoolState {
  return {
    status: 'idle',
    queryKey,
  };
}

export function reduceOpportunityPoolState(
  state: OpportunityPoolState,
  action: OpportunityPoolAction,
): OpportunityPoolState {
  switch (action.type) {
    case 'start':
      return {
        status: 'loading',
        queryKey: action.queryKey,
      };
    case 'resolve':
      return action.response.items.length > 0
        ? {
            status: 'success',
            queryKey: action.queryKey,
            response: action.response,
          }
        : {
            status: 'empty',
            queryKey: action.queryKey,
            response: action.response,
          };
    case 'fail':
      return {
        status: 'error',
        queryKey: action.queryKey,
        errorMessage: action.errorMessage,
      };
    case 'reset':
      return createOpportunityPoolIdleState(action.queryKey);
    case 'collapse':
      if (state.status === 'success' || state.status === 'empty') {
        return state;
      }

      return createOpportunityPoolIdleState(action.queryKey);
    default:
      return state;
  }
}

export function shouldLoadOpportunityPool(
  state: OpportunityPoolState,
  options: {
    isExpanded: boolean;
    queryKey: string;
  },
) {
  if (!options.isExpanded) {
    return false;
  }

  if (state.status === 'loading') {
    return state.queryKey !== options.queryKey;
  }

  if (state.status === 'success' || state.status === 'empty') {
    return state.queryKey !== options.queryKey;
  }

  if (state.status === 'error') {
    return state.queryKey !== options.queryKey;
  }

  return true;
}

export function getOpportunityPoolViewState(
  state: OpportunityPoolState,
  options: {
    isExpanded: boolean;
  },
): OpportunityPoolViewState {
  if (!options.isExpanded) {
    return 'collapsed';
  }

  if (state.status === 'idle') {
    return 'loading';
  }

  return state.status;
}
