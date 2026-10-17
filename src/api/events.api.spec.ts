import MockAdapter from "axios-mock-adapter";
import { http } from "./http";
import { eventsApi } from "./events.api";

describe("eventsApi.list", () => {
  it("sends q only when non-empty", async () => {
    const mock = new MockAdapter(http);
    mock.onGet("/events").reply(200, []);
    await eventsApi.list("jazz");
    await eventsApi.list("");
    await eventsApi.list();
    expect(mock.history.get[0].params).toEqual({ q: "jazz" });
    expect(mock.history.get[1].params).toBeUndefined();
    expect(mock.history.get[2].params).toBeUndefined();
    mock.restore();
  });
});
