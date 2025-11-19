import { useState } from "react";
import styles from "./TestPage.module.css"; // <-- Create this CSS file

export default function ShareButton() {
    const [showMenu, setShowMenu] = useState(false);
    const shareUrl = window.location.href;

    const handleCopyLink = () => {
        navigator.clipboard.writeText(shareUrl);
        alert("✅ Link copied to clipboard!");
        setShowMenu(false);
    };

    return (
        <div className={styles.shareContainer}>
            {/* Main Share Button */}
            <button
                className={styles.actionButton}
                onClick={() => {
                    console.log("Before toggle 1212:", showMenu);
                    setShowMenu(!showMenu);
                    console.log("After toggle:", !showMenu);
                }}
            >
                Share
            </button>

            {showMenu && (
                <div
                    style={{
                        position: "absolute",
                        top: "50px",
                        right: "0",
                        background: "yellow",
                        border: "2px solid red",
                        padding: "20px",
                        zIndex: 99999
                    }}
                >
                    Dropdown Visible Test!
                </div>
            )}


            {/* {showMenu && (
                <div className={styles.dropdownMenu} style={{ background: "yellow", border: "2px solid red" }}>
                    <button onClick={() => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, "_blank")}>
                        📘 Facebook
                    </button>
                    <button onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=Check this out!`, "_blank")}>
                        🐦 Twitter
                    </button>
                    <button onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent("Check this out! " + shareUrl)}`, "_blank")}>
                        📱 WhatsApp
                    </button>
                    <button onClick={handleCopyLink}>
                        🔗 Copy Link
                    </button>
                </div>
            )} */}

        </div>
    );
}
