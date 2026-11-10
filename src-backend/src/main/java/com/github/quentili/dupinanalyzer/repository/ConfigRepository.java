package com.github.quentili.dupinanalyzer.repository;

import com.github.quentili.dupinanalyzer.entity.ConfigEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface ConfigRepository extends JpaRepository<ConfigEntity, Long> {
}
