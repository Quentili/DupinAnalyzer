package com.github.quentili.dupinanalyzer.repository;

import com.github.quentili.dupinanalyzer.entity.ConfigPatternEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConfigPatternRepository extends JpaRepository<ConfigPatternEntity, Long> {
}
