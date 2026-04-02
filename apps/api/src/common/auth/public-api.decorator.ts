import { SetMetadata } from '@nestjs/common';
import { PUBLIC_API_METADATA_KEY } from './admin-api-key.constants';

export const PublicApi = () => SetMetadata(PUBLIC_API_METADATA_KEY, true);
