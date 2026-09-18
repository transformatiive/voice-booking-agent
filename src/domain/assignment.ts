import type { Business, Resource, WeeklyHours } from "./types.js";

export function resourceOffersService(resource: Resource, serviceId: string): boolean {
  return resource.serviceIds.includes(serviceId);
}

export function resourcesForService(business: Business, serviceId: string): Resource[] {
  return business.resources.filter((resource) => resourceOffersService(resource, serviceId));
}

export function hoursForResource(business: Business, resource: Resource): WeeklyHours {
  return resource.hours ?? business.hours;
}

/** First available person who can perform the service. No IVR — a generic pick. */
export function pickResourceForService(business: Business, serviceId: string): Resource | undefined {
  const candidates = resourcesForService(business, serviceId);
  return candidates.find((resource) => resource.available) ?? candidates[0];
}

export function setResourceServices(resource: Resource, serviceIds: string[]): Resource {
  const unique = [...new Set(serviceIds.filter(Boolean))];
  return { ...resource, serviceIds: unique };
}

/** Keep the many-to-many on Resource.serviceIds; rewrite membership for one service. */
export function assignResourcesToService(
  resources: Resource[],
  serviceId: string,
  resourceIds: string[],
): Resource[] {
  const wanted = new Set(resourceIds);
  return resources.map((resource) => {
    const has = resource.serviceIds.includes(serviceId);
    const should = wanted.has(resource.id);
    if (has === should) {
      return resource;
    }
    const serviceIds = should
      ? [...resource.serviceIds, serviceId]
      : resource.serviceIds.filter((id) => id !== serviceId);
    return { ...resource, serviceIds };
  });
}

export function defaultResourceRole(): string {
  return "profissional";
}
