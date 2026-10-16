import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, Router } from "vue-router";
import { eventsApi } from "@/api/events.api";
import { EventSummary } from "@/api/types";
import EventsView from "./EventsView.vue";

vi.mock("@/api/events.api", () => ({ eventsApi: { list: vi.fn() } }));

const jazz: EventSummary = {
  id: "3f1c2a9e-7b4d-4e8a-9c21-5d6f7a8b9c01",
  name: "Riyadh Jazz Night",
  venueName: "King Fahd Cultural Centre",
  startsAt: "2026-11-20T18:00:00.000Z",
  salesOpenAt: "2026-10-01T09:00:00.000Z",
  status: "on_sale",
  availableCount: 42,
};
const comedy: EventSummary = {
  ...jazz,
  id: "3f1c2a9e-7b4d-4e8a-9c21-5d6f7a8b9c02",
  name: "Comedy Showcase",
  venueName: "Boulevard Arena",
};

const list = vi.mocked(eventsApi.list);

async function mountAt(
  path: string,
): Promise<{ w: ReturnType<typeof mount>; router: Router }> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/events", component: EventsView },
      { path: "/events/:id", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const w = mount(EventsView, { global: { plugins: [router] } });
  await flushPromises();
  return { w, router };
}

async function type(w: ReturnType<typeof mount>, value: string): Promise<void> {
  await w.get("input").setValue(value);
}

describe("EventsView search", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    list.mockReset();
    list.mockResolvedValue([jazz, comedy]);
  });
  afterEach(() => vi.useRealTimers());

  it("TC-7 search input renders above the list", async () => {
    const { w } = await mountAt("/events");
    const input = w.get('input[aria-label="Search events"]');
    const grid = w.get(".grid");
    expect(
      input.element.compareDocumentPosition(grid.element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("TC-8 typing filters through the endpoint, debounced ~300 ms", async () => {
    const { w } = await mountAt("/events");
    expect(list).toHaveBeenCalledTimes(1);
    list.mockResolvedValue([jazz]);
    await type(w, "j");
    await vi.advanceTimersByTimeAsync(100);
    await type(w, "ja");
    await vi.advanceTimersByTimeAsync(100);
    await type(w, "jaz");
    await vi.advanceTimersByTimeAsync(299);
    expect(list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushPromises();
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith("jaz");
    expect(w.text()).toContain("Riyadh Jazz Night");
    expect(w.text()).not.toContain("Comedy Showcase");
  });

  it("TC-9 shows the no-match message", async () => {
    const { w } = await mountAt("/events");
    list.mockResolvedValue([]);
    await type(w, "zzz");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(w.text()).toContain("No events match your search");
    expect(w.text()).not.toContain("No events yet.");
  });

  it("TC-10 clearing the input restores the full list", async () => {
    const { w } = await mountAt("/events?q=jaz");
    list.mockResolvedValue([jazz, comedy]);
    await type(w, "");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(list).toHaveBeenLastCalledWith(undefined);
    expect(w.text()).toContain("Riyadh Jazz Night");
    expect(w.text()).toContain("Comedy Showcase");
  });

  it("TC-11 search term syncs with the URL query q", async () => {
    const { w, router } = await mountAt("/events?q=arena");
    expect((w.get("input").element as HTMLInputElement).value).toBe("arena");
    expect(list).toHaveBeenNthCalledWith(1, "arena");

    const replace = vi.spyOn(router, "replace");
    await type(w, "jazz");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.query.q).toBe("jazz");

    await type(w, "");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(router.currentRoute.value.query).not.toHaveProperty("q");
  });

  it("TC-12 search failure shows the error state", async () => {
    const { w } = await mountAt("/events");
    list.mockRejectedValue(new Error("boom"));
    await type(w, "jaz");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe("Could not load events.");
  });
});
