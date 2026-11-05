import type { HostingAccountStatus, HostingNodeStatus, ResourceStatus, ResourceType } from '@hub/api';
import type { ChipKind } from '../../../components/ui';
import { hub } from '../../../auth/client';

export const inventoryApi = hub.inventory;

export const RESOURCE_TYPE_LABEL: Record<ResourceType, string> = {
  hosting_node: 'Nodo de hosting', hosting_account: 'Cuenta de hosting', server: 'Servidor', cloud_resource: 'Recurso cloud',
  domain: 'Dominio', mail_service: 'Correo', ssl_certificate: 'Certificado SSL', cdn_zone: 'Zona CDN', bulk_email_account: 'Email masivo',
  dns_zone: 'Zona DNS', saas_instance: 'Instancia SaaS', database: 'Base de datos', storage: 'Almacenamiento', license: 'Licencia', other: 'Otro',
};
export const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  active: 'Activo', suspended: 'Suspendido', stopped: 'Detenido', terminated: 'Terminado', not_found: 'No encontrado',
};
export const RESOURCE_STATUS_CHIP: Record<ResourceStatus, ChipKind> = {
  active: 'ok', suspended: 'warn', stopped: '', terminated: 'danger', not_found: 'danger',
};
export const NODE_STATUS_LABEL: Record<HostingNodeStatus, string> = { active: 'Activo', migrating_out: 'En migración', retired: 'Retirado' };
export const NODE_STATUS_CHIP: Record<HostingNodeStatus, ChipKind> = { active: 'ok', migrating_out: 'warn', retired: '' };
export const ACCOUNT_STATUS_LABEL: Record<HostingAccountStatus, string> = { active: 'Activa', suspended: 'Suspendida', terminated: 'Terminada', not_found: 'No encontrada' };
export const ACCOUNT_STATUS_CHIP: Record<HostingAccountStatus, ChipKind> = { active: 'ok', suspended: 'warn', terminated: 'danger', not_found: 'danger' };

/** Estados editables por API (el backend no acepta not_found). */
export const RESOURCE_STATUS_EDIT: ResourceStatus[] = ['active', 'suspended', 'stopped', 'terminated'];
export const ACCOUNT_STATUS_EDIT: HostingAccountStatus[] = ['active', 'suspended', 'terminated'];
