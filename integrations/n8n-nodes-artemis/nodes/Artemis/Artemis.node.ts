import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription, IHttpRequestMethods } from 'n8n-workflow';

export class Artemis implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Artemis',
    name: 'artemis',
    icon: 'file:artemis.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Cartes virtuelles à usage unique pour agents IA, validées par un humain',
    defaults: { name: 'Artemis' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [{ name: 'artemisApi', required: true }],
    properties: [
      {
        displayName: 'Opération',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        default: 'requestCard',
        options: [
          { name: 'Demander une carte', value: 'requestCard', action: 'Demander une carte' },
          { name: 'Statut d’une demande', value: 'getStatus', action: 'Statut d une demande' },
          { name: 'Obtenir le lien de paiement', value: 'checkout', action: 'Obtenir le lien de paiement' },
          { name: 'Annuler', value: 'cancel', action: 'Annuler une carte' },
          { name: 'Budget', value: 'budgets', action: 'Lire le budget' },
        ],
      },
      { displayName: 'Montant (€)', name: 'amount', type: 'number', typeOptions: { numberPrecision: 2, minValue: 0.01 }, default: 0, displayOptions: { show: { operation: ['requestCard'] } } },
      { displayName: 'Marchand', name: 'merchant', type: 'string', default: '', displayOptions: { show: { operation: ['requestCard'] } } },
      { displayName: 'Objet', name: 'purpose', type: 'string', default: '', displayOptions: { show: { operation: ['requestCard'] } } },
      { displayName: 'ID de la demande', name: 'requestId', type: 'string', default: '={{$json.request_id}}', displayOptions: { show: { operation: ['getStatus', 'checkout', 'cancel'] } } },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const out: INodeExecutionData[] = [];
    const creds = await this.getCredentials('artemisApi');
    const base = String(creds.baseUrl).replace(/\/+$/, '');
    for (let i = 0; i < items.length; i++) {
      const op = this.getNodeParameter('operation', i) as string;
      let method: IHttpRequestMethods = 'GET';
      let url = '';
      let body: Record<string, unknown> | undefined;
      if (op === 'requestCard') {
        method = 'POST';
        url = '/v1/card-requests';
        body = {
          amount: Math.round((this.getNodeParameter('amount', i) as number) * 100),
          merchant: this.getNodeParameter('merchant', i),
          purpose: this.getNodeParameter('purpose', i),
        };
      } else if (op === 'budgets') {
        url = '/v1/budgets';
      } else {
        const id = encodeURIComponent(this.getNodeParameter('requestId', i) as string);
        if (op === 'getStatus') url = `/v1/card-requests/${id}`;
        if (op === 'checkout') { method = 'POST'; url = `/v1/card-requests/${id}/reveal`; }
        if (op === 'cancel') { method = 'POST'; url = `/v1/card-requests/${id}/cancel`; }
      }
      const res = await this.helpers.httpRequestWithAuthentication.call(this, 'artemisApi', { method, url: `${base}${url}`, body, json: true });
      out.push({ json: res as Record<string, unknown> });
    }
    return [out];
  }
}
