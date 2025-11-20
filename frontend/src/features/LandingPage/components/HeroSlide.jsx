import React from 'react';
// Assume 'styles' is the object imported from TestPage.module.css

/**
 * HeroSlide component renders a single full-screen hero section.
 * It is reusable and accepts the unique image class as a prop.
 */
const HeroSlide = ({ imageClass, styles }) => {
    // Note: 'styles' is passed from the parent to resolve CSS Module names correctly.

    return (
        <section className={`${styles.hero} ${imageClass}`}>
            <div className={styles.heroContent}>
                <h1>Explore the World with TourWise</h1>
                <p>Discover amazing destinations and items tailored for you.</p>
            </div>
            <div className={styles.scrollIndicator}>⌄</div>
        </section>
    );
};

export default HeroSlide;