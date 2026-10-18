import { describe, it, expect } from "vitest";
import {
    ElectronDiagramPrinter,
    FakeDiagramPrinter,
    unavailableDiagramPrinter,
    type PrintBackend,
    type PrintRequest,
} from "./DiagramPrinter";

/**
 * Seam under test: DiagramPrinter.print()
 * The backend (rendered window + print dialog) is a stub: this module owns the request
 * validation, the render timeout, the preview lifetime, serialization and cleanup, not the
 * Electron printing itself.
 */

function request(overrides: Partial<PrintRequest> = {}): PrintRequest {
    return { format: "pdf", xml: "<mxfile/>", title: "架构图-20241116160826-vlkz4xs.drawio", ...overrides };
}

class StubBackend implements PrintBackend {
    fail: Error | null = null;
    neverRenders = false;
    printOutcome: "printed" | "canceled" = "printed";
    renders = 0;
    shows = 0;
    prints = 0;
    destroys = 0;
    order: string[] = [];

    constructor(private label = "render") {}

    async render(): Promise<void> {
        this.renders++;
        this.order.push(`${this.label}:render`);
        if (this.fail) throw this.fail;
        if (this.neverRenders) await new Promise(() => {});
    }

    show(): void {
        this.shows++;
        this.order.push("show");
    }

    async print(): Promise<"printed" | "canceled"> {
        this.prints++;
        this.order.push("print");
        return this.printOutcome;
    }

    destroy(): void {
        this.destroys++;
        this.order.push("destroy");
    }
}

function printer(backend: StubBackend, timeoutMs?: number) {
    return new ElectronDiagramPrinter({ backend, timeoutMs });
}

describe("DiagramPrinter — printing reaches the printer only after a successful render", () => {
    it("renders, prints and releases the renderer", async () => {
        const backend = new StubBackend();

        const result = await printer(backend).print(request());

        expect(result).toEqual({ status: "printed" });
        expect(backend.order).toEqual(["render:render", "print", "destroy"]);
    });

    it("reports a dismissed print dialog as canceled and still releases the renderer", async () => {
        const backend = new StubBackend();
        backend.printOutcome = "canceled";

        const result = await printer(backend).print(request());

        expect(result).toEqual({ status: "canceled" });
        expect(backend.destroys).toBe(1);
    });

    it("waits for the user on the print dialog instead of timing out", async () => {
        const backend = new StubBackend();
        // Long dialog: the timeout covers rendering only, so a slow print still succeeds.
        backend.print = async () =>
            new Promise((resolve) => setTimeout(() => resolve("printed"), 40));

        const result = await printer(backend, 10).print(request());

        expect(result).toEqual({ status: "printed" });
    });
});

describe("DiagramPrinter — preview shows the pages and keeps them", () => {
    it("renders, shows the pages and leaves the window for the user", async () => {
        const backend = new StubBackend();

        const result = await printer(backend).print(request(), { preview: true });

        expect(result).toEqual({ status: "previewed" });
        expect(backend.prints).toBe(0);
        // The visible window *is* the result: destroying it would flash and disappear.
        expect(backend.shows).toBe(1);
        expect(backend.destroys).toBe(0);
    });

    it("replaces a previous preview with the next render", async () => {
        const backend = new StubBackend();
        const exp = printer(backend);

        await exp.print(request(), { preview: true });
        await exp.print(request(), { preview: true });

        // render() owns tearing down the window of the previous preview.
        expect(backend.renders).toBe(2);
    });
});

describe("DiagramPrinter — refuses requests it cannot render", () => {
    it("rejects a request without diagram xml and never renders", async () => {
        const backend = new StubBackend();

        await expect(printer(backend).print(request({ xml: "" }))).rejects.toThrow(/xml/i);

        expect(backend.renders).toBe(0);
    });

    it("rejects a request without a title and never renders", async () => {
        const backend = new StubBackend();

        await expect(printer(backend).print(request({ title: "" }))).rejects.toThrow(/title/i);

        expect(backend.renders).toBe(0);
    });
});

describe("DiagramPrinter — failures keep the workspace clean", () => {
    it("fails the print when rendering fails, and never opens the print dialog", async () => {
        const backend = new StubBackend();
        backend.fail = new Error("渲染失败");

        await expect(printer(backend).print(request())).rejects.toThrow("渲染失败");

        expect(backend.prints).toBe(0);
        expect(backend.destroys).toBe(1);
    });

    it("gives up on a render that never finishes and releases the renderer", async () => {
        const backend = new StubBackend();
        backend.neverRenders = true;

        await expect(printer(backend, 20).print(request())).rejects.toThrow(/timeout|超时/i);

        expect(backend.prints).toBe(0);
        expect(backend.destroys).toBe(1);
    });

    it("runs one print at a time so two requests cannot interleave", async () => {
        const backend = new StubBackend();
        const exp = printer(backend);

        await Promise.all([exp.print(request()), exp.print(request())]);

        expect(backend.order).toEqual(["render:render", "print", "destroy", "render:render", "print", "destroy"]);
    });
});

describe("FakeDiagramPrinter and the unavailable adapter sit at the same seam", () => {
    it("records requests and answers with the configured result", async () => {
        const fake = new FakeDiagramPrinter({ status: "previewed" });

        const result = await fake.print(request(), { preview: true });

        expect(result).toEqual({ status: "previewed" });
        expect(fake.calls).toHaveLength(1);
        expect(fake.calls[0].options).toEqual({ preview: true });
    });

    it("turns a request on a host without a renderer into a readable error", async () => {
        await expect(unavailableDiagramPrinter().print(request())).rejects.toThrow(/桌面/);
    });
});
