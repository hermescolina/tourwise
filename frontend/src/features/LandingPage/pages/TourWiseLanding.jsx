import React,{ useEffect, useRef, useState } from 'react';

import Navbar from '@Common/components/Navbar';
import LanguageSelector from '@Common/components/LanguageSelector'; 
import TourDisplay from '@LandingPage/components/TourDisplay';
import HeroSlide from '@LandingPage/components/HeroSlide';
import styles from '@LandingPage/CSS/TourWiseLanding.module.css'; 

export default function TourWiseLanding() {
    return (
        <>
        <div className={styles.tourwiseLanding}>
            <Navbar
                rightSlot={<LanguageSelector/>}
            />

            <div className={styles.movingGroup}>
                    <HeroSlide styles={styles} imageClass={styles.heroImage1} />
                    <HeroSlide styles={styles} imageClass={styles.heroImage2} />
                    <HeroSlide styles={styles} imageClass={styles.heroImage3} />
            </div>

            <TourDisplay
                styles={styles}
            />
        </div>
        </>
    );

    }

