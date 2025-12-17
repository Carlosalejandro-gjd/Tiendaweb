// pull-to-refresh.js

let touchStartY = 0;
let currentPullDistance = 0;
let isPulling = false;
const PULL_THRESHOLD = 80; // Pixels to pull down to trigger refresh
// MAX_PULL_DISTANCE is not strictly enforced as a limit for currentPullDistance,
// but rather for visual effect if needed. The PULL_THRESHOLD is key.

let pullIndicator;
let pullIndicatorText;
let pullIndicatorSpinner;

// Function to be called to trigger the actual refresh
let refreshAction = async () => { console.warn("Refresh action not set for pull-to-refresh."); };

function showIndicator(text, showSpinner = false) {
    if (!pullIndicator) return;
    pullIndicator.style.visibility = 'visible';
    pullIndicator.style.opacity = '1';
    if (pullIndicatorText) pullIndicatorText.textContent = text;
    if (pullIndicatorSpinner) {
        pullIndicatorSpinner.style.display = showSpinner ? 'block' : 'none';
    }
}

function updateIndicatorPosition(distance) {
    if (!pullIndicator) return;

    // Indicator starts at transform: translateY(-100%).
    // When distance = 0, transform = translateY(-100%)
    // When distance = PULL_THRESHOLD, transform = translateY(0%) -- fully visible
    // When distance > PULL_THRESHOLD, transform = translateY(small_positive_percentage_for_overpull)

    let translateYPercent;
    if (distance <= 0) { // Not pulling or pulling up
        translateYPercent = -100;
    } else if (distance < PULL_THRESHOLD) { // Pulling down, but not enough to trigger
        // Interpolate from -100% (hidden) to 0% (fully shown)
        translateYPercent = -100 + (distance / PULL_THRESHOLD) * 100;
    } else { // Pulled at or beyond threshold, allow slight overpull visual
        const overPullAmount = distance - PULL_THRESHOLD;
        // Map overpull to a small percentage, e.g., max 10% visual overpull
        translateYPercent = Math.min(10, (overPullAmount / PULL_THRESHOLD) * 10);
    }
    pullIndicator.style.transform = `translateY(${translateYPercent}%)`;

    // Update text based on whether pull is past threshold
    if (distance > PULL_THRESHOLD) {
        if (pullIndicatorText) pullIndicatorText.textContent = "Release to refresh";
    } else {
        if (pullIndicatorText) pullIndicatorText.textContent = "Pull down to refresh";
    }
}

function hideIndicator() {
    if (!pullIndicator) return;
    pullIndicator.style.opacity = '0'; // Fade out
    pullIndicator.style.transform = 'translateY(-100%)'; // Slide up

    // After transition, set visibility to hidden and reset text/spinner
    setTimeout(() => {
        // Check if still intended to be hidden (opacity might have changed again if user pulls immediately)
        if (pullIndicator.style.opacity === '0') {
            pullIndicator.style.visibility = 'hidden';
            if (pullIndicatorText) pullIndicatorText.textContent = "Pull down to refresh";
            if (pullIndicatorSpinner) pullIndicatorSpinner.style.display = 'none';
        }
    }, 300); // Should match CSS transition duration for opacity/transform
}

function handleTouchStart(event) {
    // Only start pull if at the very top of the page and it's a single touch
    if (window.scrollY === 0 && event.touches.length === 1 && !isPulling) {
        touchStartY = event.touches[0].clientY;
        currentPullDistance = 0;
        isPulling = true;
        // Make transitions snappy during the pull itself for direct manipulation feel
        if (pullIndicator) pullIndicator.style.transition = 'transform 0.05s linear, opacity 0.1s ease';
        // No immediate visual change like showIndicator() here, updateIndicatorPosition will handle it
    } else if (event.touches.length > 1) {
        // If multi-touch, cancel current pull
        if (isPulling) {
            isPulling = false;
            hideIndicator(); // Hide if a pull was in progress
        }
    }
}

function handleTouchMove(event) {
    if (!isPulling || event.touches.length !== 1) {
        return;
    }

    const currentY = event.touches[0].clientY;
    currentPullDistance = currentY - touchStartY;

    if (currentPullDistance > 0) { // Only act if pulling down
        event.preventDefault(); // Prevent page scroll while actively pulling down
        showIndicator("Pull down to refresh"); // Ensure visible and set initial text
        updateIndicatorPosition(currentPullDistance);
    } else {
        // If user pulls up beyond the start point (currentPullDistance <= 0)
        // and indicator is visible, it means they started pulling down then went up.
        // Reset visual pull or hide. updateIndicatorPosition handles negative distance by setting to -100%.
        updateIndicatorPosition(currentPullDistance);
        // if (pullIndicator && pullIndicator.style.visibility === 'visible') {
        //    hideIndicator(); // Or let updateIndicatorPosition handle it
        // }
    }
}

async function handleTouchEnd(event) {
    if (!isPulling) {
        return;
    }
    
    // Store isPulling state before async operations, reset immediately
    const wasPullingAndTriggered = currentPullDistance > PULL_THRESHOLD;
    isPulling = false;


    // Restore default transition for settling/hiding animation
    if (pullIndicator) pullIndicator.style.transition = 'transform 0.3s ease, opacity 0.3s ease';

    if (wasPullingAndTriggered) {
        console.log("Pull to refresh triggered.");
        showIndicator("Refreshing...", true); // Set text and show spinner
        // Settle the indicator at its fully visible position (translateY(0%)) while refreshing
        if (pullIndicator) pullIndicator.style.transform = 'translateY(0%)';

        try {
            await refreshAction();
            // Optional: Show a brief success message
            // showIndicator("Refreshed!", false);
            // setTimeout(hideIndicator, 1000); // Then hide
        } catch (error) {
            console.error("Pull to refresh action failed:", error);
            // Optional: Show a brief error message
            // showIndicator("Refresh failed.", false);
            // setTimeout(hideIndicator, 1500); // Then hide
        } finally {
            // Always hide the indicator after refresh attempt, after a short delay
            setTimeout(hideIndicator, 700);
        }
    } else {
        // If not pulled enough, or pull was cancelled, just hide the indicator
        hideIndicator();
    }
    currentPullDistance = 0; // Reset pull distance for next time
    touchStartY = 0;
}

export function initializePullToRefresh(actionCallback) {
    pullIndicator = document.getElementById('pull-refresh-indicator');
    if (pullIndicator) {
        pullIndicatorText = pullIndicator.querySelector('.pull-refresh-text');
        pullIndicatorSpinner = pullIndicator.querySelector('.pull-refresh-spinner');
    }

    if (!pullIndicator || !pullIndicatorText || !pullIndicatorSpinner) {
        console.warn("Pull to refresh indicator elements not found. Feature disabled.");
        return;
    }

    if (typeof actionCallback === 'function') {
        refreshAction = actionCallback;
    } else {
        console.error("No valid refresh action callback provided to initializePullToRefresh. Feature disabled.");
        return;
    }

    // Use passive: false for touchmove to allow preventDefault()
    document.addEventListener('touchstart', handleTouchStart, { passive: true }); // Can be passive
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd); // Handle cancellation same as touchend

    console.log("Pull to refresh initialized.");
}