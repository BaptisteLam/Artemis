import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class ArtemisApi implements ICredentialType {
  name = 'artemisApi';
  displayName = 'Artemis API';
  documentationUrl = 'https://artemis.pages.dev/docs/n8n';
  properties: INodeProperties[] = [
    { displayName: 'URL de l’API', name: 'baseUrl', type: 'string', default: 'https://api.artemis.workers.dev' },
    { displayName: 'Jeton de l’agent', name: 'token', type: 'string', typeOptions: { password: true }, default: '', placeholder: 'art_live_…' },
  ];
  authenticate: IAuthenticateGeneric = { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.token}}' } } };
  test: ICredentialTestRequest = { request: { baseURL: '={{$credentials.baseUrl}}', url: '/v1/me' } };
}
