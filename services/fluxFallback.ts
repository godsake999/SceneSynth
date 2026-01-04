export const generateFluxImageDirect = async (prompt: string): Promise<string> => {
    console.log("🎨 Flux: Starting generation...");
    console.log("   Prompt:", prompt);

    const clean = prompt.replace(/[^\w\s,]/gi, '');
    const enhancedPrompt = clean + ", cinematic, professional photography, vertical 9:16 aspect ratio";
    const seed = Math.floor(Math.random() * 10000);

    // Use the direct image endpoint - returns actual image bytes
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=720&height=1280&seed=${seed}&model=flux&nologo=true&enhance=true`;

    console.log("   URL created:", url.substring(0, 80) + "...");
    console.log("   Calling backend proxy at /api/generate");

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'proxyFlux', url })
        });

        console.log("   Response status:", response.status, response.statusText);

        if (!response.ok) {
            console.error("   Backend proxy returned error status");
            throw new Error(`Proxy failed: ${response.status}`);
        }

        const result = await response.json();
        console.log("   Backend response:", {
            success: result.success,
            hasData: !!result.data,
            dataPrefix: result.data?.substring(0, 30)
        });

        if (result.success && result.data) {
            // Check if it's actually an image (should start with data:image/)
            if (result.data.startsWith('data:image/')) {
                console.log("   ✅ Got VALID image data, length:", result.data.length);
                return result.data;
            } else {
                console.warn("   ⚠️ Got data but it's not an image! Type:", result.data.substring(0, 20));
                console.warn("   Pollinations returned HTML instead of image. Using placeholder.");
                return `https://placehold.co/720x1280/1e293b/cbd5e1?text=${encodeURIComponent(clean.substring(0, 30))}`;
            }
        }

        console.warn("   ⚠️ No data in response");
        return `https://placehold.co/720x1280/1e293b/cbd5e1?text=Generation+Failed`;
    } catch (e) {
        console.error("   ❌ Flux proxy failed:", e);
        return `https://placehold.co/720x1280/1e293b/cbd5e1?text=Error`;
    }
};