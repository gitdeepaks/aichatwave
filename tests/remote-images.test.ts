import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { approvedRemoteImageUrl } from "@/lib/remote-images";

describe("approvedRemoteImageUrl", () => {
  it("accepts known HTTPS thumbnail hosts", () => {
    assert.equal(
      approvedRemoteImageUrl("https://encrypted-tbn0.gstatic.com/images?q=1"),
      "https://encrypted-tbn0.gstatic.com/images?q=1",
    );
    assert.equal(
      approvedRemoteImageUrl("https://s.yimg.com/uu/api/res/1.2/image.jpg"),
      "https://s.yimg.com/uu/api/res/1.2/image.jpg",
    );
  });

  it("rejects unknown hosts, non-HTTPS URLs, and malformed input", () => {
    assert.equal(approvedRemoteImageUrl("https://example.test/image.jpg"), null);
    assert.equal(approvedRemoteImageUrl("http://s.yimg.com/image.jpg"), null);
    assert.equal(approvedRemoteImageUrl("not a URL"), null);
    assert.equal(approvedRemoteImageUrl(null), null);
  });
});
